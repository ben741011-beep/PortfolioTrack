import type { Collection, Db, Document, IndexDescription } from "mongodb";

import { getAuthDatabase } from "@/models/Auth";

export const AUTH_COLLECTION_NAMES = [
  "user",
  "session",
  "account",
  "verification",
] as const;

export type AuthCollectionName = (typeof AUTH_COLLECTION_NAMES)[number];

const optionalString = { bsonType: ["string", "null"] } as const;
const optionalDate = { bsonType: ["date", "null"] } as const;

export const authCollectionValidators: Record<AuthCollectionName, Document> = {
  user: {
    $jsonSchema: {
      bsonType: "object",
      required: ["name", "email", "emailVerified", "createdAt", "updatedAt"],
      additionalProperties: false,
      properties: {
        _id: { bsonType: "objectId" },
        name: { bsonType: "string", minLength: 1, maxLength: 200 },
        email: { bsonType: "string", minLength: 3, maxLength: 320 },
        emailVerified: { bsonType: "bool" },
        image: optionalString,
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" },
      },
    },
  },
  session: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "expiresAt",
        "token",
        "createdAt",
        "updatedAt",
        "userId",
      ],
      additionalProperties: false,
      properties: {
        _id: { bsonType: "objectId" },
        expiresAt: { bsonType: "date" },
        token: { bsonType: "string", minLength: 1 },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" },
        ipAddress: optionalString,
        userAgent: optionalString,
        userId: { bsonType: "objectId" },
      },
    },
  },
  account: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "accountId",
        "providerId",
        "userId",
        "createdAt",
        "updatedAt",
      ],
      additionalProperties: false,
      properties: {
        _id: { bsonType: "objectId" },
        accountId: { bsonType: "string", minLength: 1 },
        providerId: { bsonType: "string", minLength: 1 },
        userId: { bsonType: "objectId" },
        accessToken: optionalString,
        refreshToken: optionalString,
        idToken: optionalString,
        accessTokenExpiresAt: optionalDate,
        refreshTokenExpiresAt: optionalDate,
        scope: optionalString,
        password: optionalString,
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" },
      },
    },
  },
  verification: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "identifier",
        "value",
        "expiresAt",
        "createdAt",
        "updatedAt",
      ],
      additionalProperties: false,
      properties: {
        _id: { bsonType: "objectId" },
        identifier: { bsonType: "string", minLength: 1 },
        value: { bsonType: "string", minLength: 1 },
        expiresAt: { bsonType: "date" },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" },
      },
    },
  },
};

const authCollectionIndexes: Record<AuthCollectionName, IndexDescription[]> = {
  user: [{ key: { email: 1 }, name: "user_email_uidx", unique: true }],
  session: [
    { key: { token: 1 }, name: "session_token_uidx", unique: true },
    { key: { userId: 1 }, name: "session_userId_idx" },
  ],
  account: [
    { key: { userId: 1 }, name: "account_userId_idx" },
    {
      key: { providerId: 1, accountId: 1 },
      name: "account_providerId_accountId_uidx",
      unique: true,
    },
  ],
  verification: [
    { key: { identifier: 1 }, name: "verification_identifier_idx" },
  ],
};

let authCollectionsReady = false;

async function ensureCollection(
  database: Db,
  name: AuthCollectionName,
): Promise<Collection> {
  const info = await database
    .listCollections({ name }, { nameOnly: false })
    .next();

  if (!info) {
    return database.createCollection(name, {
      validator: authCollectionValidators[name],
      validationLevel: "strict",
      validationAction: "error",
    });
  }

  const collection = database.collection(name);
  const existingCount = await collection.countDocuments({});

  if (existingCount > 0 && !info.options?.validator) {
    throw new Error(
      `驗證 collection ${name} 已有資料但沒有 validator，停止自動調整`,
    );
  }

  const sample = await collection.findOne({});
  const allowedFields = new Set([
    "_id",
    ...Object.keys(
      (authCollectionValidators[name].$jsonSchema as Document).properties,
    ),
  ]);
  const unexpectedField = sample
    ? Object.keys(sample).find((field) => !allowedFields.has(field))
    : undefined;

  if (unexpectedField) {
    throw new Error(
      `驗證 collection ${name} 含有未核准欄位 ${unexpectedField}，停止自動調整`,
    );
  }

  await database.command({
    collMod: name,
    validator: authCollectionValidators[name],
    validationLevel: "strict",
    validationAction: "error",
  });

  return collection;
}

export async function prepareAuthCollections() {
  const database = await getAuthDatabase();

  for (const name of AUTH_COLLECTION_NAMES) {
    const collection = await ensureCollection(database, name);
    for (const index of authCollectionIndexes[name]) {
      await collection.createIndex(index.key!, index);
    }
  }

  authCollectionsReady = true;
}

export async function assertAuthCollectionsReady() {
  if (authCollectionsReady) return;

  const database = await getAuthDatabase();

  for (const name of AUTH_COLLECTION_NAMES) {
    const info = await database
      .listCollections({ name }, { nameOnly: false })
      .next();
    if (!info?.options?.validator) {
      throw new Error(`驗證 collection ${name} 尚未完成初始化`);
    }
  }

  authCollectionsReady = true;
}

export async function findAuthUserIdByEmail(email: string) {
  const database = await getAuthDatabase();
  const user = await database.collection("user").findOne({ email });
  return user?._id.toString() ?? null;
}
