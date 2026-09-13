import type {
  ClientSession,
  Collection,
  Document,
  IndexDescription,
} from "mongodb";
import { ObjectId } from "mongodb";

import clientPromise from "@/lib/mongodb";
import {
  dividendRecordJsonSchema,
  DIVIDEND_RECORD_COLLECTION,
} from "@/models/DividendRecord";
import {
  stockPositionJsonSchema,
  STOCK_POSITION_COLLECTION,
} from "@/models/StockPosition";
import {
  stockTransactionJsonSchema,
  STOCK_TRANSACTION_COLLECTION,
} from "@/models/StockTransaction";
import {
  usStockPositionJsonSchema,
  US_STOCK_POSITION_COLLECTION,
} from "@/models/UsStockPosition";

type PersonalCollectionDefinition = {
  name: string;
  expectedLegacyCount: number;
  jsonSchema: Document;
  replacementIndexes: IndexDescription[];
  legacyIndexes: string[];
};

const PERSONAL_COLLECTIONS: PersonalCollectionDefinition[] = [
  {
    name: STOCK_POSITION_COLLECTION,
    expectedLegacyCount: 4,
    jsonSchema: stockPositionJsonSchema,
    replacementIndexes: [
      {
        key: { userId: 1, stockCode: 1 },
        name: "userId_1_stockCode_1",
        unique: true,
      },
    ],
    legacyIndexes: ["stockCode_1"],
  },
  {
    name: STOCK_TRANSACTION_COLLECTION,
    expectedLegacyCount: 3,
    jsonSchema: stockTransactionJsonSchema,
    replacementIndexes: [
      {
        key: { userId: 1, occurredAt: -1 },
        name: "userId_1_occurredAt_-1",
      },
      {
        key: { userId: 1, stockCode: 1, occurredAt: -1 },
        name: "userId_1_stockCode_1_occurredAt_-1",
      },
    ],
    legacyIndexes: ["occurredAt_-1", "stockCode_1_occurredAt_-1"],
  },
  {
    name: US_STOCK_POSITION_COLLECTION,
    expectedLegacyCount: 3,
    jsonSchema: usStockPositionJsonSchema,
    replacementIndexes: [
      {
        key: { userId: 1, stockCode: 1 },
        name: "userId_1_stockCode_1",
        unique: true,
      },
    ],
    legacyIndexes: ["stockCode_1"],
  },
  {
    name: DIVIDEND_RECORD_COLLECTION,
    expectedLegacyCount: 16,
    jsonSchema: dividendRecordJsonSchema,
    replacementIndexes: [
      {
        key: { userId: 1, source: 1, stockCode: 1, exDividendDate: 1 },
        name: "userId_1_source_1_stockCode_1_exDividendDate_1",
        unique: true,
      },
    ],
    legacyIndexes: ["source_1_stockCode_1_exDividendDate_1"],
  },
];

function optionalOwnershipSchema(jsonSchema: Document): Document {
  const required = (jsonSchema.required as string[]).filter(
    (field) => field !== "userId",
  );
  return { ...jsonSchema, required };
}

async function setValidator(name: string, jsonSchema: Document) {
  const client = await clientPromise;
  await client.db().command({
    collMod: name,
    validator: { $jsonSchema: jsonSchema },
    validationLevel: "strict",
    validationAction: "error",
  });
}

async function getCollection(name: string): Promise<Collection<Document>> {
  const client = await clientPromise;
  return client.db().collection(name);
}

export async function inspectOwnershipMigration() {
  const client = await clientPromise;
  const database = client.db();
  const collections = [];

  for (const definition of PERSONAL_COLLECTIONS) {
    const info = await database
      .listCollections({ name: definition.name }, { nameOnly: false })
      .next();

    if (!info) {
      throw new Error(`找不到 collection：${definition.name}`);
    }

    const collection = database.collection(definition.name);
    const [totalCount, unownedCount, ownerDocuments, indexes, unownedIds] =
      await Promise.all([
        collection.countDocuments({}),
        collection.countDocuments({ userId: { $exists: false } }),
        collection
          .aggregate<{ _id: string }>([
            { $match: { userId: { $exists: true } } },
            { $group: { _id: "$userId" } },
          ])
          .toArray(),
        collection.indexes(),
        collection
          .find({ userId: { $exists: false } }, { projection: { _id: 1 } })
          .toArray(),
      ]);

    collections.push({
      name: definition.name,
      expectedLegacyCount: definition.expectedLegacyCount,
      totalCount,
      unownedCount,
      ownerIds: ownerDocuments.map((document) => String(document._id)),
      validatorPresent: Boolean(info.options?.validator),
      indexes: indexes.map((index) => ({
        name: index.name,
        key: index.key,
        unique: Boolean(index.unique),
      })),
      unownedIds: unownedIds.map((document) => document._id.toString()),
    });
  }

  return { database: database.databaseName, collections };
}

export function assertMigrationCanTargetUser(
  inspection: Awaited<ReturnType<typeof inspectOwnershipMigration>>,
  userId?: string,
) {
  for (const collection of inspection.collections) {
    if (collection.totalCount !== collection.expectedLegacyCount) {
      throw new Error(
        `${collection.name} 目前 ${collection.totalCount} 筆，與核准的 ${collection.expectedLegacyCount} 筆不符`,
      );
    }

    const unexpectedOwners = userId
      ? collection.ownerIds.filter((ownerId) => ownerId !== userId)
      : collection.ownerIds;

    if (unexpectedOwners.length > 0) {
      throw new Error(`${collection.name} 已存在其他帳號的 userId，停止歸戶`);
    }
  }
}

export async function preparePersonalCollectionsForOwnership() {
  for (const definition of PERSONAL_COLLECTIONS) {
    await setValidator(
      definition.name,
      optionalOwnershipSchema(definition.jsonSchema),
    );
  }
}

async function assignCollection(
  name: string,
  userId: string,
  session: ClientSession,
) {
  const collection = await getCollection(name);
  return collection.updateMany(
    { userId: { $exists: false } },
    { $set: { userId } },
    { session },
  );
}

export async function assignLegacyDataToUser(userId: string) {
  const client = await clientPromise;
  const session = client.startSession();
  const modifiedCounts: Record<string, number> = {};

  try {
    await session.withTransaction(async () => {
      for (const definition of PERSONAL_COLLECTIONS) {
        const result = await assignCollection(definition.name, userId, session);
        modifiedCounts[definition.name] = result.modifiedCount;
      }
    });
  } finally {
    await session.endSession();
  }

  return modifiedCounts;
}

export async function finalizePersonalCollectionOwnership() {
  for (const definition of PERSONAL_COLLECTIONS) {
    const collection = await getCollection(definition.name);
    const existingIndexNames = new Set(
      (await collection.indexes()).map((index) => index.name),
    );

    for (const index of definition.replacementIndexes) {
      await collection.createIndex(index.key!, index);
    }

    for (const legacyIndex of definition.legacyIndexes) {
      if (existingIndexNames.has(legacyIndex)) {
        await collection.dropIndex(legacyIndex);
      }
    }

    await setValidator(definition.name, definition.jsonSchema);
  }
}

export async function verifyOwnershipByIds(
  userId: string,
  inspection: Awaited<ReturnType<typeof inspectOwnershipMigration>>,
) {
  const verifiedCounts: Record<string, number> = {};

  for (const item of inspection.collections) {
    const collection = await getCollection(item.name);
    const ids = item.unownedIds.map((id) => new ObjectId(id));
    const verified = await collection.countDocuments({
      _id: { $in: ids },
      userId,
    });
    const remainingUnowned = await collection.countDocuments({
      userId: { $exists: false },
    });

    if (verified !== ids.length || remainingUnowned !== 0) {
      throw new Error(`${item.name} 歸戶後依 _id 查回驗證失敗`);
    }

    verifiedCounts[item.name] = verified;
  }

  return verifiedCounts;
}
