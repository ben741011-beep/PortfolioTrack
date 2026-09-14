import { ObjectId, type Collection, type WithId } from "mongodb";

import clientPromise from "@/lib/mongodb";

export const FAMILY_MEMBER_COLLECTION = "familyMembers";
export const FAMILY_MEMBER_RELATIONSHIPS = ["self", "child"] as const;

export type FamilyMemberRelationship =
  (typeof FAMILY_MEMBER_RELATIONSHIPS)[number];

export interface FamilyMemberDocument {
  userId: string;
  name: string;
  relationship: FamilyMemberRelationship;
  birthDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const familyMemberJsonSchema = {
  bsonType: "object",
  required: [
    "userId",
    "name",
    "relationship",
    "birthDate",
    "createdAt",
    "updatedAt",
  ],
  additionalProperties: false,
  properties: {
    _id: { bsonType: "objectId" },
    userId: { bsonType: "string", minLength: 1, maxLength: 100 },
    name: { bsonType: "string", minLength: 1, maxLength: 40 },
    relationship: { enum: FAMILY_MEMBER_RELATIONSHIPS },
    birthDate: { bsonType: ["date", "null"] },
    createdAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" },
  },
} as const;

type FamilyMemberInput = {
  name: string;
  relationship: FamilyMemberRelationship;
  birthDate: Date | null;
};

function parseObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Request body 必須是 JSON object");
  }

  const input = value as Record<string, unknown>;
  const allowedFields = new Set(["name", "relationship", "birthDate"]);
  const unexpectedField = Object.keys(input).find(
    (field) => !allowedFields.has(field),
  );

  if (unexpectedField) {
    throw new TypeError(`不支援欄位：${unexpectedField}`);
  }

  return input;
}

export function parseFamilyMemberInput(value: unknown): FamilyMemberInput {
  const input = parseObject(value);
  const name = typeof input.name === "string" ? input.name.trim() : "";

  if (!name || name.length > 40) {
    throw new TypeError("姓名必須是 1 至 40 個字元");
  }

  if (input.relationship !== "self" && input.relationship !== "child") {
    throw new TypeError("身分必須是本人或孩子");
  }

  let birthDate: Date | null = null;
  if (input.birthDate !== null && input.birthDate !== undefined && input.birthDate !== "") {
    if (
      typeof input.birthDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate)
    ) {
      throw new TypeError("出生日期格式必須是 YYYY-MM-DD");
    }

    birthDate = new Date(`${input.birthDate}T00:00:00.000Z`);
    if (Number.isNaN(birthDate.getTime())) {
      throw new TypeError("出生日期不正確");
    }
  }

  return { name, relationship: input.relationship, birthDate };
}

export function parseFamilyMemberId(value: unknown): ObjectId {
  if (typeof value !== "string" || !ObjectId.isValid(value)) {
    throw new TypeError("家庭成員 ID 格式不正確");
  }

  return new ObjectId(value);
}

export function serializeFamilyMember(
  document: WithId<FamilyMemberDocument>,
) {
  return {
    id: document._id.toHexString(),
    name: document.name,
    relationship: document.relationship,
    birthDate: document.birthDate?.toISOString().slice(0, 10) ?? null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

export async function getFamilyMemberCollection(): Promise<
  Collection<FamilyMemberDocument>
> {
  const client = await clientPromise;
  return client.db().collection<FamilyMemberDocument>(FAMILY_MEMBER_COLLECTION);
}

export async function listFamilyMembers(userId: string) {
  const collection = await getFamilyMemberCollection();
  return collection
    .find({ userId })
    .sort({ relationship: 1, createdAt: 1 })
    .toArray();
}

export async function findFamilyMember(userId: string, id: ObjectId) {
  const collection = await getFamilyMemberCollection();
  return collection.findOne({ _id: id, userId });
}

export async function insertFamilyMember(
  userId: string,
  input: FamilyMemberInput,
) {
  const collection = await getFamilyMemberCollection();
  const now = new Date();
  const document: FamilyMemberDocument = {
    userId,
    ...input,
    createdAt: now,
    updatedAt: now,
  };
  const result = await collection.insertOne(document);
  const inserted = await collection.findOne({ _id: result.insertedId, userId });

  if (!inserted) throw new Error("新增後無法查回家庭成員");
  return inserted;
}

export async function updateFamilyMember(
  userId: string,
  id: ObjectId,
  input: FamilyMemberInput,
) {
  const collection = await getFamilyMemberCollection();
  const result = await collection.updateOne(
    { _id: id, userId },
    { $set: { ...input, updatedAt: new Date() } },
  );
  if (result.matchedCount === 0) return null;
  return collection.findOne({ _id: id, userId });
}
