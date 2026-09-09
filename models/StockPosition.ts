import { ObjectId, type Collection, type WithId } from "mongodb";

import clientPromise from "@/lib/mongodb";
import {
  normalizeStockCode,
  type StockAssetType,
} from "@/lib/taiwan-stock";

export const STOCK_POSITION_COLLECTION = "stockPositions";

export const STOCK_ASSET_TYPES = ["stock", "stockEtf", "bondEtf"] as const;

export interface StockPositionDocument {
  stockCode: string;
  stockName: string;
  assetType: StockAssetType;
  shares: number;
  principal: number;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateStockPositionInput = Pick<
  StockPositionDocument,
  "stockCode" | "shares" | "principal"
>;

export type UpdateStockPositionInput = Pick<
  StockPositionDocument,
  "shares" | "principal"
>;

export type StockPositionMutationResult =
  | { status: "notFound" | "conflict" }
  | {
      status: "success";
      document: WithId<StockPositionDocument>;
      modifiedCount?: number;
      deletedCount?: number;
    };

export const stockPositionJsonSchema = {
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
    stockCode: { bsonType: "string", minLength: 1, maxLength: 20 },
    stockName: { bsonType: "string", minLength: 1, maxLength: 100 },
    assetType: { enum: STOCK_ASSET_TYPES },
    shares: { bsonType: ["int", "long"], minimum: 1 },
    principal: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
      exclusiveMinimum: true,
    },
    createdAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" },
  },
} as const;

function parseNumber(value: unknown, fieldName: string): number {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new TypeError(`${fieldName}必須是大於 0 的數字`);
  }

  return numberValue;
}

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

export function parseCreateStockPositionInput(
  value: unknown,
): CreateStockPositionInput {
  const input = parseObject(value, ["stockCode", "shares", "principal"]);

  const shares = parseNumber(input.shares, "股票股數");

  if (!Number.isSafeInteger(shares)) {
    throw new TypeError("股票股數必須是正整數");
  }

  return {
    stockCode: normalizeStockCode(input.stockCode),
    shares,
    principal: parseNumber(input.principal, "投資金額"),
  };
}

export function parseUpdateStockPositionInput(
  value: unknown,
): UpdateStockPositionInput {
  const input = parseObject(value, ["shares", "principal"]);

  if (!("shares" in input) || !("principal" in input)) {
    throw new TypeError("修改時必須提供股票股數與投資金額");
  }

  const shares = parseNumber(input.shares, "股票股數");

  if (!Number.isSafeInteger(shares)) {
    throw new TypeError("股票股數必須是正整數");
  }

  return {
    shares,
    principal: parseNumber(input.principal, "投資金額"),
  };
}

export function parseStockPositionId(value: string): ObjectId {
  if (!ObjectId.isValid(value)) {
    throw new TypeError("庫存 ID 格式不正確");
  }

  const objectId = new ObjectId(value);

  if (objectId.toHexString() !== value.toLowerCase()) {
    throw new TypeError("庫存 ID 格式不正確");
  }

  return objectId;
}

export function serializeStockPosition(document: WithId<StockPositionDocument>) {
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

export async function getStockPositionCollection(): Promise<
  Collection<StockPositionDocument>
> {
  const client = await clientPromise;
  return client.db().collection<StockPositionDocument>(STOCK_POSITION_COLLECTION);
}

export async function listStockPositions() {
  const collection = await getStockPositionCollection();
  return collection.find({}).sort({ createdAt: -1 }).limit(100).toArray();
}

export async function insertStockPosition(document: StockPositionDocument) {
  const collection = await getStockPositionCollection();
  const result = await collection.insertOne(document);
  const inserted = await collection.findOne({ _id: result.insertedId });

  if (!inserted) {
    throw new Error("新增後無法查回股票庫存");
  }

  return inserted;
}

export async function updateStockPosition(
  id: ObjectId,
  input: UpdateStockPositionInput,
): Promise<StockPositionMutationResult> {
  const collection = await getStockPositionCollection();
  const existing = await collection.findOne({ _id: id });

  if (!existing) {
    return { status: "notFound" };
  }

  const result = await collection.updateOne(
    { _id: id, updatedAt: existing.updatedAt },
    {
      $set: {
        shares: input.shares,
        principal: input.principal,
        updatedAt: new Date(),
      },
    },
  );

  if (result.matchedCount !== 1) {
    return { status: "conflict" };
  }

  const updated = await collection.findOne({ _id: id });

  if (!updated) {
    throw new Error("修改後無法查回股票庫存");
  }

  return {
    status: "success",
    document: updated,
    modifiedCount: result.modifiedCount,
  };
}

export async function deleteStockPosition(
  id: ObjectId,
): Promise<StockPositionMutationResult> {
  const collection = await getStockPositionCollection();
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

  return {
    status: "success",
    document: existing,
    deletedCount: result.deletedCount,
  };
}
