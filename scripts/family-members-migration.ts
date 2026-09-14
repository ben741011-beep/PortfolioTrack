import { ObjectId } from "mongodb";

import clientPromise from "../lib/mongodb";
import {
  DIVIDEND_RECORD_COLLECTION,
  dividendRecordJsonSchema,
} from "../models/DividendRecord";
import {
  FAMILY_MEMBER_COLLECTION,
  familyMemberJsonSchema,
  type FamilyMemberDocument,
} from "../models/FamilyMember";
import {
  STOCK_POSITION_COLLECTION,
  stockPositionJsonSchema,
} from "../models/StockPosition";
import {
  STOCK_TRANSACTION_COLLECTION,
  stockTransactionJsonSchema,
} from "../models/StockTransaction";
import {
  US_STOCK_POSITION_COLLECTION,
  usStockPositionJsonSchema,
} from "../models/UsStockPosition";

const write = process.argv.includes("--write");
const dataCollections = [
  STOCK_POSITION_COLLECTION,
  US_STOCK_POSITION_COLLECTION,
  STOCK_TRANSACTION_COLLECTION,
  DIVIDEND_RECORD_COLLECTION,
] as const;

const validatorByCollection = {
  [STOCK_POSITION_COLLECTION]: stockPositionJsonSchema,
  [US_STOCK_POSITION_COLLECTION]: usStockPositionJsonSchema,
  [STOCK_TRANSACTION_COLLECTION]: stockTransactionJsonSchema,
  [DIVIDEND_RECORD_COLLECTION]: dividendRecordJsonSchema,
} as const;

async function main() {
const client = await clientPromise;
const database = client.db();
const collectionNames = new Set(
  (await database.listCollections({}, { nameOnly: true }).toArray()).map(
    (item) => item.name,
  ),
);

const userIds = new Set<string>();
if (collectionNames.has("user")) {
  const authUsers = await database.collection("user").find({}, { projection: { _id: 1 } }).toArray();
  authUsers.forEach((user) => userIds.add(user._id.toString()));
}

const preview: Record<string, { missingCount: number; ids: ObjectId[] }> = {};
for (const name of dataCollections) {
  const collection = database.collection(name);
  const owners = await collection
    .find({ userId: { $type: "string" } }, { projection: { userId: 1 } })
    .toArray();
  owners.forEach((document) => {
    if (typeof document.userId === "string") userIds.add(document.userId);
  });
  const documents = await collection
    .find({ familyMemberId: { $exists: false } }, { projection: { _id: 1 } })
    .toArray();
  preview[name] = { missingCount: documents.length, ids: documents.map((document) => document._id) };
}

console.log(JSON.stringify({
  mode: write ? "write" : "preview",
  database: database.databaseName,
  users: userIds.size,
  familyMembersCollectionExists: collectionNames.has(FAMILY_MEMBER_COLLECTION),
  affected: Object.fromEntries(Object.entries(preview).map(([name, value]) => [name, value.missingCount])),
}, null, 2));

if (!write) {
  await client.close();
  return;
}

if (!collectionNames.has(FAMILY_MEMBER_COLLECTION)) {
  await database.createCollection(FAMILY_MEMBER_COLLECTION, {
    validator: { $jsonSchema: familyMemberJsonSchema },
    validationLevel: "strict",
    validationAction: "error",
  });
} else {
  await database.command({
    collMod: FAMILY_MEMBER_COLLECTION,
    validator: { $jsonSchema: familyMemberJsonSchema },
    validationLevel: "strict",
    validationAction: "error",
  });
}

const familyMembers = database.collection<FamilyMemberDocument>(FAMILY_MEMBER_COLLECTION);
await familyMembers.createIndex(
  { userId: 1, relationship: 1 },
  {
    name: "userId_1_relationship_1_self_unique",
    unique: true,
    partialFilterExpression: { relationship: "self" },
  },
);
await familyMembers.createIndex(
  { userId: 1, createdAt: 1 },
  { name: "userId_1_createdAt_1" },
);

const memberByUser = new Map<string, ObjectId>();
for (const userId of userIds) {
  let member = await familyMembers.findOne({ userId, relationship: "self" });
  if (!member) {
    const now = new Date();
    const result = await familyMembers.insertOne({
      userId,
      name: "我的資產",
      relationship: "self",
      birthDate: null,
      createdAt: now,
      updatedAt: now,
    });
    member = await familyMembers.findOne({ _id: result.insertedId, userId });
  }
  if (!member) throw new Error(`無法建立或查回 ${userId} 的本人資產檔案`);
  memberByUser.set(userId, member._id);
}

// Existing strict validators reject unknown fields. First allow familyMemberId
// without requiring it, populate the field, then enforce the final required schema.
for (const name of dataCollections) {
  const schema = validatorByCollection[name];
  await database.command({
    collMod: name,
    validator: {
      $jsonSchema: {
        ...schema,
        required: schema.required.filter((field) => field !== "familyMemberId"),
      },
    },
    validationLevel: "strict",
    validationAction: "error",
  });
}

const modified: Record<string, number> = {};
for (const name of dataCollections) {
  const collection = database.collection(name);
  let modifiedCount = 0;
  for (const [userId, familyMemberId] of memberByUser) {
    const result = await collection.updateMany(
      { userId, familyMemberId: { $exists: false } },
      { $set: { familyMemberId } },
    );
    modifiedCount += result.modifiedCount;
  }
  modified[name] = modifiedCount;

  await database.command({
    collMod: name,
    validator: { $jsonSchema: validatorByCollection[name] },
    validationLevel: "strict",
    validationAction: "error",
  });
}

const indexChanges = [
  {
    name: STOCK_POSITION_COLLECTION,
    old: "userId_1_stockCode_1",
    key: { userId: 1, familyMemberId: 1, stockCode: 1 },
    next: "userId_1_familyMemberId_1_stockCode_1",
    unique: true,
  },
  {
    name: US_STOCK_POSITION_COLLECTION,
    old: "userId_1_stockCode_1",
    key: { userId: 1, familyMemberId: 1, stockCode: 1 },
    next: "userId_1_familyMemberId_1_stockCode_1",
    unique: true,
  },
  {
    name: DIVIDEND_RECORD_COLLECTION,
    old: "userId_1_source_1_stockCode_1_exDividendDate_1",
    key: { userId: 1, familyMemberId: 1, source: 1, stockCode: 1, exDividendDate: 1 },
    next: "userId_1_familyMemberId_1_source_1_stockCode_1_exDividendDate_1",
    unique: true,
  },
] as const;

for (const change of indexChanges) {
  const collection = database.collection(change.name);
  const indexes = await collection.indexes();
  if (indexes.some((index) => index.name === change.old)) await collection.dropIndex(change.old);
  await collection.createIndex(change.key, { name: change.next, unique: change.unique });
}

const transactionCollection = database.collection(STOCK_TRANSACTION_COLLECTION);
for (const oldName of ["userId_1_occurredAt_-1", "userId_1_stockCode_1_occurredAt_-1"]) {
  const indexes = await transactionCollection.indexes();
  if (indexes.some((index) => index.name === oldName)) await transactionCollection.dropIndex(oldName);
}
await transactionCollection.createIndex(
  { userId: 1, familyMemberId: 1, occurredAt: -1 },
  { name: "userId_1_familyMemberId_1_occurredAt_-1" },
);
await transactionCollection.createIndex(
  { userId: 1, familyMemberId: 1, stockCode: 1, occurredAt: -1 },
  { name: "userId_1_familyMemberId_1_stockCode_1_occurredAt_-1" },
);

const verified: Record<string, number> = {};
for (const name of dataCollections) {
  const ids = preview[name].ids;
  verified[name] = ids.length
    ? await database.collection(name).countDocuments({ _id: { $in: ids }, familyMemberId: { $type: "objectId" } })
    : 0;
}

console.log(JSON.stringify({ modified, verified, familyMembers: await familyMembers.countDocuments({}) }, null, 2));
await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
