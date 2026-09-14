import {
  ObjectId,
  type ClientSession,
  type Collection,
  type WithId,
} from "mongodb";

import clientPromise from "@/lib/mongodb";
import {
  normalizeStockCode,
  type StockAssetType,
} from "@/lib/taiwan-stock";

export const STOCK_POSITION_COLLECTION = "stockPositions";

export const STOCK_ASSET_TYPES = ["stock", "stockEtf", "bondEtf"] as const;

export interface StockPositionDocument {
  userId: string;
  familyMemberId: ObjectId;
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

export type StockTradeSide = "buy" | "sell";

export interface StockTradeInput {
  stockCode: string;
  side: StockTradeSide;
  shares: number;
  price: number;
}

export const STOCK_TRANSACTION_FEE_RATE = 0.001425;

export const STOCK_TRANSACTION_TAX_RATES: Record<StockAssetType, number> = {
  stock: 0.003,
  stockEtf: 0.001,
  bondEtf: 0,
};

export type StockTradeCalculation = {
  grossAmount: number;
  transactionFee: number;
  transactionTax: number;
  cashAmount: number;
};

export type StockTradeResult =
  | { status: "notFound" }
  | { status: "insufficientShares"; availableShares: number }
  | { status: "conflict" }
  | {
      status: "success";
      document: WithId<StockPositionDocument> | null;
      matchedCount: number;
      modifiedCount: number;
      upsertedCount: number;
      deletedCount: number;
      costBasisReduction: number;
      realizedProfitLoss: number;
    };

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
    "userId",
    "familyMemberId",
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
    userId: { bsonType: "string", minLength: 1, maxLength: 100 },
    familyMemberId: { bsonType: "objectId" },
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

export function parseStockTradeInput(value: unknown): StockTradeInput {
  const input = parseObject(value, ["stockCode", "side", "shares", "price"]);
  const shares = parseNumber(input.shares, "股票股數");

  if (!Number.isSafeInteger(shares)) {
    throw new TypeError("股票股數必須是正整數");
  }

  if (input.side !== "buy" && input.side !== "sell") {
    throw new TypeError("交易方向必須是 buy 或 sell");
  }

  const price = parseNumber(input.price, "每股成交價");
  const grossAmount = shares * price;

  if (!Number.isFinite(grossAmount) || grossAmount > Number.MAX_SAFE_INTEGER) {
    throw new TypeError("交易金額超出可處理範圍");
  }

  return {
    stockCode: normalizeStockCode(input.stockCode),
    side: input.side,
    shares,
    price,
  };
}

export function calculateStockTrade(
  input: StockTradeInput,
  assetType: StockAssetType,
): StockTradeCalculation {
  const grossAmount = input.shares * input.price;
  const transactionFee = grossAmount * STOCK_TRANSACTION_FEE_RATE;
  const transactionTax =
    input.side === "sell"
      ? grossAmount * STOCK_TRANSACTION_TAX_RATES[assetType]
      : 0;
  const cashAmount =
    input.side === "buy"
      ? grossAmount + transactionFee
      : grossAmount - transactionFee - transactionTax;

  return {
    grossAmount,
    transactionFee,
    transactionTax,
    cashAmount,
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

export async function listStockPositions(userId: string, familyMemberId: ObjectId) {
  const collection = await getStockPositionCollection();
  return collection
    .find({ userId, familyMemberId })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();
}

export async function insertStockPosition(document: StockPositionDocument) {
  const collection = await getStockPositionCollection();
  const result = await collection.insertOne(document);
  const inserted = await collection.findOne({
    _id: result.insertedId,
    userId: document.userId,
    familyMemberId: document.familyMemberId,
  });

  if (!inserted) {
    throw new Error("新增後無法查回股票庫存");
  }

  return inserted;
}

export async function findStockPositionByCode(
  userId: string,
  familyMemberId: ObjectId,
  stockCode: string,
) {
  const collection = await getStockPositionCollection();
  return collection.findOne({ userId, familyMemberId, stockCode });
}

export async function applyStockTrade(
  userId: string,
  familyMemberId: ObjectId,
  input: StockTradeInput,
  stock: Pick<StockPositionDocument, "stockCode" | "stockName" | "assetType">,
  calculation: StockTradeCalculation,
  session?: ClientSession,
): Promise<StockTradeResult> {
  const collection = await getStockPositionCollection();

  if (input.side === "buy") {
    const now = new Date();
    const result = await collection.updateOne(
      { userId, familyMemberId, stockCode: stock.stockCode },
      {
        $inc: {
          shares: input.shares,
          principal: calculation.cashAmount,
        },
        $set: { updatedAt: now },
        $setOnInsert: {
          userId,
          familyMemberId,
          stockName: stock.stockName,
          assetType: stock.assetType,
          createdAt: now,
        },
      },
      { upsert: true, session },
    );

    const position = await collection.findOne(
      { userId, familyMemberId, stockCode: stock.stockCode },
      { session },
    );

    if (!position) {
      throw new Error("買入後無法取得股票庫存");
    }

    const verified = await collection.findOne(
      { _id: position._id, userId, familyMemberId },
      { session },
    );

    if (!verified) {
      throw new Error("買入後無法依庫存 ID 查回驗證");
    }

    return {
      status: "success",
      document: verified,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      upsertedCount: result.upsertedCount,
      deletedCount: 0,
      costBasisReduction: 0,
      realizedProfitLoss: 0,
    };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await collection.findOne(
      { userId, familyMemberId, stockCode: input.stockCode },
      { session },
    );

    if (!current) {
      return { status: "notFound" };
    }

    if (current.shares < input.shares) {
      return {
        status: "insufficientShares",
        availableShares: current.shares,
      };
    }

    const costBasisReduction =
      current.principal * (input.shares / current.shares);
    const realizedProfitLoss = calculation.cashAmount - costBasisReduction;

    if (current.shares === input.shares) {
      const result = await collection.deleteOne(
        {
          _id: current._id,
          userId,
          familyMemberId,
          shares: current.shares,
          updatedAt: current.updatedAt,
        },
        { session },
      );

      if (result.deletedCount !== 1) {
        continue;
      }

      const verified = await collection.findOne(
        { _id: current._id, userId, familyMemberId },
        { session },
      );

      if (verified) {
        throw new Error("賣出後庫存仍存在，無法完成刪除驗證");
      }

      return {
        status: "success",
        document: null,
        matchedCount: 1,
        modifiedCount: 0,
        upsertedCount: 0,
        deletedCount: result.deletedCount,
        costBasisReduction,
        realizedProfitLoss,
      };
    }

    const result = await collection.updateOne(
      {
        _id: current._id,
        userId,
        familyMemberId,
        shares: current.shares,
        updatedAt: current.updatedAt,
      },
      {
        $set: {
          shares: current.shares - input.shares,
          principal: current.principal - costBasisReduction,
          updatedAt: new Date(),
        },
      },
      { session },
    );

    if (result.matchedCount !== 1) {
      continue;
    }

    const verified = await collection.findOne(
      { _id: current._id, userId, familyMemberId },
      { session },
    );

    if (!verified) {
      throw new Error("賣出後無法依庫存 ID 查回驗證");
    }

    return {
      status: "success",
      document: verified,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      upsertedCount: 0,
      deletedCount: 0,
      costBasisReduction,
      realizedProfitLoss,
    };
  }

  return { status: "conflict" };
}

export async function updateStockPosition(
  userId: string,
  familyMemberId: ObjectId,
  id: ObjectId,
  input: UpdateStockPositionInput,
): Promise<StockPositionMutationResult> {
  const collection = await getStockPositionCollection();
  const existing = await collection.findOne({ _id: id, userId, familyMemberId });

  if (!existing) {
    return { status: "notFound" };
  }

  const result = await collection.updateOne(
    { _id: id, userId, familyMemberId, updatedAt: existing.updatedAt },
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

  const updated = await collection.findOne({ _id: id, userId, familyMemberId });

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
  userId: string,
  familyMemberId: ObjectId,
  id: ObjectId,
): Promise<StockPositionMutationResult> {
  const collection = await getStockPositionCollection();
  const existing = await collection.findOne({ _id: id, userId, familyMemberId });

  if (!existing) {
    return { status: "notFound" };
  }

  const result = await collection.deleteOne({
    _id: id,
    userId,
    familyMemberId,
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
