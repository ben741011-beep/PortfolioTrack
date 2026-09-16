import { isDeepStrictEqual } from "node:util";

import {
  ObjectId,
  type AnyBulkWriteOperation,
  type Collection,
  type IndexDescription,
  type WithId,
} from "mongodb";

import clientPromise from "@/lib/mongodb";
import {
  STOCK_ASSET_TYPES,
  type StockPositionDocument,
} from "@/models/StockPosition";

export const DIVIDEND_RECORD_COLLECTION = "dividendRecords";
export const DIVIDEND_START_YEAR = 2025;

export const DIVIDEND_SOURCES = [
  "twseStock",
  "tpexStock",
  "twseEtf",
  "tpexEtf",
  "yahooUs",
] as const;

export type DividendSource = (typeof DIVIDEND_SOURCES)[number];
export type DividendStatus = "pending" | "paid";
export type DividendMarket = "tw" | "us";
export type DividendCurrency = "TWD" | "USD";

export const US_DIVIDEND_WITHHOLDING_TAX_RATE = 0.3;

export interface DividendRecordDocument {
  userId: string;
  familyMemberId: ObjectId;
  stockCode: string;
  stockName: string;
  assetType: StockPositionDocument["assetType"];
  market: DividendMarket;
  currency: DividendCurrency;
  source: DividendSource;
  dividendYear: number;
  exDividendDate: Date;
  recordDate: Date | null;
  paymentDate: Date | null;
  dividendPerShare: number;
  entitledShares: number;
  grossAmount: number;
  withholdingTaxRate: number;
  withholdingTax: number;
  netAmount: number;
  status: DividendStatus;
  lockedAt: Date | null;
  sourceUpdatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type DividendRecordKey = Pick<
  DividendRecordDocument,
  "source" | "stockCode" | "exDividendDate"
>;

export type DividendRecordSyncUpdate = Pick<
  DividendRecordDocument,
  | "stockName"
  | "assetType"
  | "market"
  | "currency"
  | "dividendYear"
  | "recordDate"
  | "paymentDate"
  | "dividendPerShare"
  | "entitledShares"
  | "grossAmount"
  | "withholdingTaxRate"
  | "withholdingTax"
  | "netAmount"
  | "status"
  | "lockedAt"
  | "sourceUpdatedAt"
  | "updatedAt"
>;

export function hasDividendRecordSyncChanges(
  existing: WithId<DividendRecordDocument>,
  values: DividendRecordSyncUpdate,
) {
  return Object.entries(values).some(
    ([field, value]) =>
      field !== "sourceUpdatedAt" &&
      field !== "updatedAt" &&
      !isDeepStrictEqual(existing[field as keyof DividendRecordDocument], value),
  );
}

export type DividendRecordSyncChange =
  | { kind: "insert"; document: DividendRecordDocument }
  | { kind: "update"; id: ObjectId; expectedUpdatedAt: Date; values: DividendRecordSyncUpdate };

export function reconcileDividendRecordSyncChanges(
  changes: DividendRecordSyncChange[],
  affectedIds: ObjectId[],
  baselineDocuments: WithId<DividendRecordDocument>[],
  afterDocuments: WithId<DividendRecordDocument>[],
) {
  const baselineById = new Map(
    baselineDocuments.map((document) => [document._id.toHexString(), document]),
  );
  const afterById = new Map(
    afterDocuments.map((document) => [document._id.toHexString(), document]),
  );
  const insertedIds: string[] = [];
  const changedIds: string[] = [];
  const unchangedIds: string[] = [];
  const missingIds: string[] = [];

  changes.forEach((change, index) => {
    const id = affectedIds[index].toHexString();
    const after = afterById.get(id);
    if (change.kind === "insert") {
      if (after) insertedIds.push(id);
      else missingIds.push(id);
    } else if (!after) {
      missingIds.push(id);
    } else if (isDeepStrictEqual(after, baselineById.get(id))) {
      unchangedIds.push(id);
    } else {
      changedIds.push(id);
    }
  });

  return { insertedIds, changedIds, unchangedIds, missingIds };
}

export type DividendSyncReconciliation =
  | {
      status: "reconciled";
      beforeCount: number;
      afterCount: number;
      plannedInserts: number;
      plannedUpdates: number;
      insertedIds: string[];
      changedIds: string[];
      unchangedIds: string[];
      missingIds: string[];
    }
  | { status: "unknown"; plannedInserts: number; plannedUpdates: number };

export class DividendSyncPersistenceError extends Error {
  constructor(public readonly reconciliation: DividendSyncReconciliation) {
    super(
      reconciliation.status === "unknown"
        ? "股息批次失敗且無法完成資料庫核對；持久化結果未知，請勿直接重試"
        : "股息批次未完成；已核對資料庫中的目標 ID，請先確認結果再重試",
    );
    this.name = "DividendSyncPersistenceError";
  }
}

export const dividendRecordJsonSchema = {
  bsonType: "object",
  required: [
    "userId",
    "familyMemberId",
    "stockCode",
    "stockName",
    "assetType",
    "market",
    "currency",
    "source",
    "dividendYear",
    "exDividendDate",
    "recordDate",
    "paymentDate",
    "dividendPerShare",
    "entitledShares",
    "grossAmount",
    "withholdingTaxRate",
    "withholdingTax",
    "netAmount",
    "status",
    "lockedAt",
    "sourceUpdatedAt",
    "createdAt",
    "updatedAt",
  ],
  additionalProperties: false,
  properties: {
    _id: { bsonType: "objectId" },
    userId: { bsonType: "string", minLength: 1, maxLength: 100 },
    familyMemberId: { bsonType: "objectId" },
    stockCode: { bsonType: "string", minLength: 1, maxLength: 20 },
    stockName: { bsonType: "string", minLength: 1, maxLength: 100 },
    assetType: { enum: STOCK_ASSET_TYPES },
    market: { enum: ["tw", "us"] },
    currency: { enum: ["TWD", "USD"] },
    source: { enum: DIVIDEND_SOURCES },
    dividendYear: { bsonType: ["int", "long"], minimum: 1900 },
    exDividendDate: { bsonType: "date" },
    recordDate: { bsonType: ["date", "null"] },
    paymentDate: { bsonType: ["date", "null"] },
    dividendPerShare: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
      exclusiveMinimum: true,
    },
    entitledShares: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
      exclusiveMinimum: true,
    },
    grossAmount: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
      exclusiveMinimum: true,
    },
    withholdingTaxRate: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
      maximum: 1,
    },
    withholdingTax: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
    },
    netAmount: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
    },
    status: { enum: ["pending", "paid"] },
    lockedAt: { bsonType: ["date", "null"] },
    sourceUpdatedAt: { bsonType: "date" },
    createdAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" },
  },
} as const;

export const dividendRecordIndexes: IndexDescription[] = [
  {
    key: { userId: 1, familyMemberId: 1, source: 1, stockCode: 1, exDividendDate: 1 },
    name: "userId_1_familyMemberId_1_source_1_stockCode_1_exDividendDate_1",
    unique: true,
  },
];

function roundTo(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function calculateDividendAmounts(input: {
  market: DividendMarket;
  dividendPerShare: number;
  entitledShares: number;
}) {
  const rawGrossAmount = input.dividendPerShare * input.entitledShares;
  const grossAmount = roundTo(rawGrossAmount, input.market === "us" ? 2 : 6);
  const withholdingTaxRate =
    input.market === "us" ? US_DIVIDEND_WITHHOLDING_TAX_RATE : 0;
  const withholdingTax =
    input.market === "us"
      ? roundTo(grossAmount * withholdingTaxRate, 2)
      : 0;
  const netAmount =
    input.market === "us"
      ? roundTo(grossAmount - withholdingTax, 2)
      : grossAmount;

  return { grossAmount, withholdingTaxRate, withholdingTax, netAmount };
}

export async function getDividendRecordCollection(): Promise<
  Collection<DividendRecordDocument>
> {
  const client = await clientPromise;
  return client
    .db()
    .collection<DividendRecordDocument>(DIVIDEND_RECORD_COLLECTION);
}

export async function assertDividendRecordCollectionReady() {
  const client = await clientPromise;
  const database = client.db();
  const collectionInfo = await database
    .listCollections({ name: DIVIDEND_RECORD_COLLECTION }, { nameOnly: false })
    .next();

  if (
    !collectionInfo ||
    !isDeepStrictEqual(collectionInfo.options?.validator, {
      $jsonSchema: dividendRecordJsonSchema,
    }) ||
    collectionInfo.options?.validationLevel !== "strict" ||
    collectionInfo.options?.validationAction !== "error"
  ) {
    throw new Error("dividendRecords collection validator 或驗證設定與 model 不一致");
  }

  const collection = database.collection(DIVIDEND_RECORD_COLLECTION);
  const actualIndexes = (await collection.indexes())
    .filter((index) => index.name !== "_id_")
    .map(indexDefinition)
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  const expectedIndexes = dividendRecordIndexes
    .map(indexDefinition)
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

  if (!isDeepStrictEqual(actualIndexes, expectedIndexes)) {
    throw new Error("dividendRecords collection 索引定義與 model 不一致");
  }
}

function indexDefinition(index: IndexDescription) {
  const options: Record<string, unknown> = { ...index };
  delete options.v;
  delete options.ns;
  delete options.key;
  return {
    ...options,
    name: index.name ?? "",
    key: Object.entries(index.key ?? {}),
  };
}

export async function findDividendRecordsByKeys(
  userId: string,
  familyMemberId: ObjectId,
  keys: DividendRecordKey[],
) {
  if (keys.length === 0) {
    return [];
  }

  const collection = await getDividendRecordCollection();
  return collection
    .find({
      userId,
      familyMemberId,
      $or: keys.map((key) => ({
        source: key.source,
        stockCode: key.stockCode,
        exDividendDate: key.exDividendDate,
      })),
    })
    .toArray();
}

export async function applyDividendRecordSyncChanges(
  userId: string,
  familyMemberId: ObjectId,
  changes: DividendRecordSyncChange[],
) {
  if (changes.length === 0) {
    return { insertedCount: 0, modifiedCount: 0, matchedCount: 0, verifiedCount: 0 };
  }

  await assertDividendRecordCollectionReady();
  const collection = await getDividendRecordCollection();
  const updates = changes.filter((change) => change.kind === "update");
  const inserts = changes.filter((change) => change.kind === "insert");
  const baselineCount = await collection.countDocuments({});
  const updateIds = updates.map((change) => change.id);
  const baselineDocuments = updateIds.length
    ? await collection.find({ _id: { $in: updateIds }, userId, familyMemberId }).toArray()
    : [];
  const baselineById = new Map(
    baselineDocuments.map((document) => [document._id.toHexString(), document]),
  );

  if (
    baselineDocuments.length !== updates.length ||
    updates.some((change) =>
      baselineById.get(change.id.toHexString())?.updatedAt.getTime() !==
      change.expectedUpdatedAt.getTime(),
    )
  ) {
    throw new Error("股息同步目標已變更，停止寫入並請重新預覽");
  }

  if (inserts.length) {
    const existingInsert = await collection.findOne({
      userId,
      familyMemberId,
      $or: inserts.map((change) => ({
        source: change.document.source,
        stockCode: change.document.stockCode,
        exDividendDate: change.document.exDividendDate,
      })),
    });
    if (existingInsert) {
      throw new Error("股息同步新增目標已存在，停止寫入並請重新預覽");
    }
  }

  const affectedIds: ObjectId[] = [];
  const operations: AnyBulkWriteOperation<DividendRecordDocument>[] = changes.map(
    (change) => {
      if (change.kind === "insert") {
        const id = new ObjectId();
        affectedIds.push(id);
        return { insertOne: { document: { _id: id, ...change.document } } };
      }

      affectedIds.push(change.id);
      return {
        updateOne: {
          filter: { _id: change.id, userId, familyMemberId, updatedAt: change.expectedUpdatedAt },
          update: { $set: change.values },
        },
      };
    },
  );

  try {
    const result = await collection.bulkWrite(operations, { ordered: false });
    const verifiedDocuments = await collection
      .find({ _id: { $in: affectedIds }, userId, familyMemberId })
      .toArray();
    const verifiedById = new Map(
      verifiedDocuments.map((document) => [document._id.toHexString(), document]),
    );
    const fullyVerified = changes.every((change, index) => {
      const document = verifiedById.get(affectedIds[index].toHexString());
      const expected = change.kind === "insert" ? change.document : change.values;
      return document && Object.entries(expected).every(
        ([field, value]) =>
          isDeepStrictEqual(document[field as keyof DividendRecordDocument], value),
      );
    });

    if (
      result.matchedCount !== updates.length ||
      result.insertedCount !== inserts.length ||
      !fullyVerified
    ) {
      throw new Error("股息資料寫入結果與預期不符");
    }

    return {
      insertedCount: result.insertedCount,
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount,
      verifiedCount: verifiedDocuments.length,
    };
  } catch (error) {
    let afterDocuments: WithId<DividendRecordDocument>[];
    let afterCount: number;
    try {
      [afterDocuments, afterCount] = await Promise.all([
        collection.find({ _id: { $in: affectedIds }, userId, familyMemberId }).toArray(),
        collection.countDocuments({}),
      ]);
    } catch (reconciliationError) {
      console.error("股息批次核對失敗", {
        writeError: error instanceof Error ? error.name : "unknown",
        reconciliationError:
          reconciliationError instanceof Error ? reconciliationError.name : "unknown",
      });
      throw new DividendSyncPersistenceError({
        status: "unknown",
        plannedInserts: inserts.length,
        plannedUpdates: updates.length,
      });
    }

    const reconciliation = reconcileDividendRecordSyncChanges(
      changes,
      affectedIds,
      baselineDocuments,
      afterDocuments,
    );
    console.error("股息批次寫入失敗，已依資料庫核對", {
      writeError: error instanceof Error ? error.name : "unknown",
    });
    throw new DividendSyncPersistenceError({
      status: "reconciled",
      beforeCount: baselineCount,
      afterCount,
      plannedInserts: inserts.length,
      plannedUpdates: updates.length,
      ...reconciliation,
    });
  }
}

export async function listDividendRecords(
  userId: string,
  familyMemberId: ObjectId,
) {
  const collection = await getDividendRecordCollection();
  return collection
    .find({
      userId,
      familyMemberId,
      dividendYear: { $gte: DIVIDEND_START_YEAR },
    })
    .sort({ paymentDate: -1, exDividendDate: -1 })
    .toArray();
}

export function serializeDividendRecord(
  document: WithId<DividendRecordDocument>,
) {
  return {
    id: document._id.toHexString(),
    stockCode: document.stockCode,
    stockName: document.stockName,
    assetType: document.assetType,
    market: document.market,
    currency: document.currency,
    source: document.source,
    dividendYear: document.dividendYear,
    exDividendDate: document.exDividendDate.toISOString(),
    recordDate: document.recordDate?.toISOString() ?? null,
    paymentDate: document.paymentDate?.toISOString() ?? null,
    dividendPerShare: document.dividendPerShare,
    entitledShares: document.entitledShares,
    grossAmount: document.grossAmount,
    withholdingTaxRate: document.withholdingTaxRate,
    withholdingTax: document.withholdingTax,
    netAmount: document.netAmount,
    status: document.status,
    lockedAt: document.lockedAt?.toISOString() ?? null,
    sourceUpdatedAt: document.sourceUpdatedAt.toISOString(),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}
