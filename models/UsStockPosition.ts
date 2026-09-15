import {
  ObjectId,
  type ClientSession,
  type Collection,
  type WithId,
} from "mongodb";

import clientPromise from "@/lib/mongodb";

export const US_STOCK_POSITION_COLLECTION = "usStockPositions";
export const US_STOCK_ASSET_TYPES = ["stock", "stockEtf", "bondEtf"] as const;

export type UsStockAssetType = (typeof US_STOCK_ASSET_TYPES)[number];

export interface UsStockPositionDocument {
  userId: string;
  familyMemberId: ObjectId;
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

export type UsStockTradeSide = "buy" | "sell";

export interface UsStockTradeInput {
  stockCode: string;
  side: UsStockTradeSide;
  shares: number;
  price: number;
}

export const US_STOCK_TRANSACTION_FEE_RATE = 0.002;

export type UsStockTradeCalculation = {
  grossAmount: number;
  transactionFee: number;
  secFee: number;
  tafFee: number;
  cashAmount: number;
};

export type UsStockTradeResult =
  | { status: "notFound" }
  | { status: "insufficientShares"; availableShares: number }
  | { status: "conflict" }
  | {
      status: "success";
      document: WithId<UsStockPositionDocument> | null;
      matchedCount: number;
      modifiedCount: number;
      upsertedCount: number;
      deletedCount: number;
      costBasisReduction: number;
      realizedProfitLoss: number;
    };

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

export function parseUsStockTradeInput(value: unknown): UsStockTradeInput {
  const input = parseObject(value, ["stockCode", "side", "shares", "price"]);

  if (input.side !== "buy" && input.side !== "sell") {
    throw new TypeError("交易方向必須是 buy 或 sell");
  }

  const shares = parsePositiveNumber(input.shares, "交易股數");
  const price = parsePositiveNumber(input.price, "每股成交價");
  const grossAmount = shares * price;

  if (!Number.isFinite(grossAmount) || grossAmount > Number.MAX_SAFE_INTEGER) {
    throw new TypeError("交易金額超出可處理範圍");
  }

  return {
    stockCode: parseUsStockPositionCode(input.stockCode),
    side: input.side,
    shares,
    price,
  };
}

export function calculateUsStockTrade(
  input: UsStockTradeInput,
): UsStockTradeCalculation {
  const grossAmount = input.shares * input.price;
  const transactionFee = grossAmount * US_STOCK_TRANSACTION_FEE_RATE;
  const secFee = 0;
  const tafFee = 0;
  const cashAmount =
    input.side === "buy"
      ? grossAmount + transactionFee
      : grossAmount - transactionFee - secFee - tafFee;

  if (!Number.isFinite(cashAmount) || cashAmount <= 0) {
    throw new TypeError("交易成本不可高於成交金額");
  }

  return { grossAmount, transactionFee, secFee, tafFee, cashAmount };
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

export async function listUsStockPositions(userId: string, familyMemberId: ObjectId) {
  const collection = await getUsStockPositionCollection();
  return collection
    .find({ userId, familyMemberId })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();
}

export async function findUsStockPositionByCode(
  userId: string,
  familyMemberId: ObjectId,
  stockCode: string,
) {
  const collection = await getUsStockPositionCollection();
  return collection.findOne({ userId, familyMemberId, stockCode });
}

export async function applyUsStockTrade(
  userId: string,
  familyMemberId: ObjectId,
  input: UsStockTradeInput,
  stock: Pick<UsStockPositionDocument, "stockCode" | "stockName" | "assetType">,
  calculation: UsStockTradeCalculation,
  session?: ClientSession,
): Promise<UsStockTradeResult> {
  const collection = await getUsStockPositionCollection();

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
      throw new Error("買入後無法取得美股庫存");
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

    const remainingShares = current.shares - input.shares;
    if (remainingShares < -1e-9) {
      return {
        status: "insufficientShares",
        availableShares: current.shares,
      };
    }

    const costBasisReduction =
      current.principal * (input.shares / current.shares);
    const realizedProfitLoss = calculation.cashAmount - costBasisReduction;

    if (Math.abs(remainingShares) <= 1e-9) {
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
        throw new Error("賣出後美股庫存仍存在，無法完成刪除驗證");
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
          shares: remainingShares,
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

export async function insertUsStockPosition(
  document: UsStockPositionDocument,
) {
  const collection = await getUsStockPositionCollection();
  const result = await collection.insertOne(document);
  const inserted = await collection.findOne({
    _id: result.insertedId,
    userId: document.userId,
    familyMemberId: document.familyMemberId,
  });

  if (!inserted) {
    throw new Error("新增後無法依 ID 查回美股庫存");
  }

  return inserted;
}

export async function updateUsStockPosition(
  userId: string,
  familyMemberId: ObjectId,
  id: ObjectId,
  input: UpdateUsStockPositionInput,
): Promise<UsStockPositionMutationResult> {
  const collection = await getUsStockPositionCollection();
  const existing = await collection.findOne({ _id: id, userId, familyMemberId });

  if (!existing) {
    return { status: "notFound" };
  }

  const result = await collection.updateOne(
    { _id: id, userId, familyMemberId, updatedAt: existing.updatedAt },
    { $set: { ...input, updatedAt: new Date() } },
  );

  if (result.matchedCount !== 1) {
    return { status: "conflict" };
  }

  const updated = await collection.findOne({ _id: id, userId, familyMemberId });

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
  userId: string,
  familyMemberId: ObjectId,
  id: ObjectId,
): Promise<UsStockPositionMutationResult> {
  const collection = await getUsStockPositionCollection();
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

  const deleted = await collection.findOne({ _id: id, userId, familyMemberId });

  if (deleted) {
    throw new Error("刪除後美股庫存仍存在");
  }

  return {
    status: "success",
    document: existing,
    deletedCount: result.deletedCount,
  };
}
