import { ObjectId, type Collection, type WithId } from "mongodb";

import clientPromise from "@/lib/mongodb";

export const US_STOCK_POSITION_COLLECTION = "usStockPositions";
export const US_STOCK_ASSET_TYPES = ["stock", "stockEtf", "bondEtf"] as const;

export type UsStockAssetType = (typeof US_STOCK_ASSET_TYPES)[number];

export interface UsStockPositionDocument {
  stockCode: string;
  stockName: string;
  assetType: UsStockAssetType;
  shares: number;
  principal: number;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateUsStockPositionInput = Pick<
  UsStockPositionDocument,
  "stockCode" | "shares" | "principal"
>;

export type UpdateUsStockPositionInput = Pick<
  UsStockPositionDocument,
  "shares" | "principal"
>;

export type UsStockPositionMutationResult =
  | { status: "notFound" | "conflict" }
  | {
      status: "success";
      document: WithId<UsStockPositionDocument>;
      modifiedCount?: number;
      deletedCount?: number;
    };

export const usStockPositionJsonSchema = {
  bsonType: "object",
  required: [
    "stockCode",
    "stockName",
    "assetType",
    "shares",
    "principal",
    "createdAt",
    "updatedAt",
  ],
  additionalProperties: false,
  properties: {
    _id: { bsonType: "objectId" },
    stockCode: { bsonType: "string", minLength: 1, maxLength: 10 },
    stockName: { bsonType: "string", minLength: 1, maxLength: 100 },
    assetType: { enum: US_STOCK_ASSET_TYPES },
    shares: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
      exclusiveMinimum: true,
    },
    principal: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
      exclusiveMinimum: true,
    },
    createdAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" },
  },
} as const;

function parseObject(
  value: unknown,
  allowedFields: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Request body 必須是 JSON object");
  }

  const input = value as Record<string, unknown>;
  const allowedFieldSet = new Set(allowedFields);
  const unexpectedField = Object.keys(input).find(
    (field) => !allowedFieldSet.has(field),
  );

  if (unexpectedField) {
    throw new TypeError(`不支援欄位：${unexpectedField}`);
  }

  return input;
}

function parsePositiveNumber(value: unknown, fieldName: string): number {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;

  if (
    !Number.isFinite(numberValue) ||
    numberValue <= 0 ||
    numberValue > Number.MAX_SAFE_INTEGER
  ) {
    throw new TypeError(`${fieldName}必須是大於 0 的有效數字`);
  }

  return numberValue;
}

export function parseUsStockPositionCode(value: unknown): string {
  if (typeof value !== "string") {
    throw new TypeError("美股代號必須是文字");
  }

  const stockCode = value.trim().toUpperCase();

  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(stockCode)) {
    throw new TypeError("美股代號格式不正確");
  }

  return stockCode;
}

export function parseCreateUsStockPositionInput(
  value: unknown,
): CreateUsStockPositionInput {
  const input = parseObject(value, ["stockCode", "shares", "principal"]);

  return {
    stockCode: parseUsStockPositionCode(input.stockCode),
    shares: parsePositiveNumber(input.shares, "持有股數"),
    principal: parsePositiveNumber(input.principal, "投入成本"),
  };
}

export function parseUpdateUsStockPositionInput(
  value: unknown,
): UpdateUsStockPositionInput {
  const input = parseObject(value, ["shares", "principal"]);

  if (!("shares" in input) || !("principal" in input)) {
    throw new TypeError("修改時必須提供股數與投入成本");
  }

  return {
    shares: parsePositiveNumber(input.shares, "持有股數"),
    principal: parsePositiveNumber(input.principal, "投入成本"),
  };
}

export function parseUsStockPositionId(value: string): ObjectId {
  if (!ObjectId.isValid(value)) {
    throw new TypeError("美股庫存 ID 格式不正確");
  }

  const objectId = new ObjectId(value);

  if (objectId.toHexString() !== value.toLowerCase()) {
    throw new TypeError("美股庫存 ID 格式不正確");
  }

  return objectId;
}

export function serializeUsStockPosition(
  document: WithId<UsStockPositionDocument>,
) {
  return {
    id: document._id.toHexString(),
    stockCode: document.stockCode,
    stockName: document.stockName,
    assetType: document.assetType,
    shares: document.shares,
    principal: document.principal,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

export function summarizeUsStockPositions(
  documents: WithId<UsStockPositionDocument>[],
) {
  return {
    count: documents.length,
    totalPrincipal: documents.reduce(
      (total, document) => total + document.principal,
      0,
    ),
    stockCount: documents.filter((document) => document.assetType === "stock")
      .length,
    etfCount: documents.filter((document) => document.assetType !== "stock")
      .length,
  };
}

export async function getUsStockPositionCollection(): Promise<
  Collection<UsStockPositionDocument>
> {
  const client = await clientPromise;
  return client
    .db()
    .collection<UsStockPositionDocument>(US_STOCK_POSITION_COLLECTION);
}

export async function listUsStockPositions() {
  const collection = await getUsStockPositionCollection();
  return collection.find({}).sort({ createdAt: -1 }).limit(100).toArray();
}

export async function insertUsStockPosition(
  document: UsStockPositionDocument,
) {
  const collection = await getUsStockPositionCollection();
  const result = await collection.insertOne(document);
  const inserted = await collection.findOne({ _id: result.insertedId });

  if (!inserted) {
    throw new Error("新增後無法依 ID 查回美股庫存");
  }

  return inserted;
}

export async function updateUsStockPosition(
  id: ObjectId,
  input: UpdateUsStockPositionInput,
): Promise<UsStockPositionMutationResult> {
  const collection = await getUsStockPositionCollection();
  const existing = await collection.findOne({ _id: id });

  if (!existing) {
    return { status: "notFound" };
  }

  const result = await collection.updateOne(
    { _id: id, updatedAt: existing.updatedAt },
    { $set: { ...input, updatedAt: new Date() } },
  );

  if (result.matchedCount !== 1) {
    return { status: "conflict" };
  }

  const updated = await collection.findOne({ _id: id });

  if (!updated) {
    throw new Error("修改後無法依 ID 查回美股庫存");
  }

  return {
    status: "success",
    document: updated,
    modifiedCount: result.modifiedCount,
  };
}

export async function deleteUsStockPosition(
  id: ObjectId,
): Promise<UsStockPositionMutationResult> {
  const collection = await getUsStockPositionCollection();
  const existing = await collection.findOne({ _id: id });

  if (!existing) {
    return { status: "notFound" };
  }

  const result = await collection.deleteOne({
    _id: id,
    updatedAt: existing.updatedAt,
  });

  if (result.deletedCount !== 1) {
    return { status: "conflict" };
  }

  const deleted = await collection.findOne({ _id: id });

  if (deleted) {
    throw new Error("刪除後美股庫存仍存在");
  }

  return {
    status: "success",
    document: existing,
    deletedCount: result.deletedCount,
  };
}
