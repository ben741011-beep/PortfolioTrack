import { ObjectId, type Collection, type IndexDescription, type WithId } from "mongodb";

import clientPromise from "@/lib/mongodb";
import {
  applyUsStockTrade,
  US_STOCK_ASSET_TYPES,
  type UsStockPositionDocument,
  type UsStockTradeCalculation,
  type UsStockTradeInput,
  type UsStockTradeResult,
} from "@/models/UsStockPosition";

export const US_STOCK_TRANSACTION_COLLECTION = "usStockTransactions";
export const usStockTransactionIndexes: IndexDescription[] = [
  {
    key: { userId: 1, familyMemberId: 1, occurredAt: -1 },
    name: "userId_1_familyMemberId_1_occurredAt_-1",
  },
  {
    key: { userId: 1, familyMemberId: 1, stockCode: 1, occurredAt: -1 },
    name: "userId_1_familyMemberId_1_stockCode_1_occurredAt_-1",
  },
];

export interface UsStockTransactionDocument {
  userId: string;
  familyMemberId: ObjectId;
  stockCode: string;
  stockName: string;
  assetType: UsStockPositionDocument["assetType"];
  side: UsStockTradeInput["side"];
  shares: number;
  price: number;
  grossAmount: number;
  transactionFee: number;
  secFee: number;
  tafFee: number;
  cashAmount: number;
  costBasisReduction: number;
  realizedProfitLoss: number;
  afterShares: number;
  afterPrincipal: number;
  occurredAt: Date;
  createdAt: Date;
}

type SuccessfulUsStockTradeResult = Extract<
  UsStockTradeResult,
  { status: "success" }
>;

export type RecordedUsStockTradeResult =
  | Exclude<UsStockTradeResult, { status: "success" }>
  | (SuccessfulUsStockTradeResult & {
      transaction: WithId<UsStockTransactionDocument>;
    });

export const usStockTransactionJsonSchema = {
  bsonType: "object",
  required: [
    "userId",
    "familyMemberId",
    "stockCode",
    "stockName",
    "assetType",
    "side",
    "shares",
    "price",
    "grossAmount",
    "transactionFee",
    "secFee",
    "tafFee",
    "cashAmount",
    "costBasisReduction",
    "realizedProfitLoss",
    "afterShares",
    "afterPrincipal",
    "occurredAt",
    "createdAt",
  ],
  additionalProperties: false,
  properties: {
    _id: { bsonType: "objectId" },
    userId: { bsonType: "string", minLength: 1, maxLength: 100 },
    familyMemberId: { bsonType: "objectId" },
    stockCode: { bsonType: "string", minLength: 1, maxLength: 10 },
    stockName: { bsonType: "string", minLength: 1, maxLength: 100 },
    assetType: { enum: US_STOCK_ASSET_TYPES },
    side: { enum: ["buy", "sell"] },
    shares: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
      exclusiveMinimum: true,
    },
    price: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
      exclusiveMinimum: true,
    },
    grossAmount: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
      exclusiveMinimum: true,
    },
    transactionFee: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
    },
    secFee: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
    },
    tafFee: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
      maximum: 9.79,
    },
    cashAmount: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
      exclusiveMinimum: true,
    },
    costBasisReduction: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
    },
    realizedProfitLoss: {
      bsonType: ["int", "long", "double", "decimal"],
    },
    afterShares: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
    },
    afterPrincipal: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
    },
    occurredAt: { bsonType: "date" },
    createdAt: { bsonType: "date" },
  },
} as const;

export async function getUsStockTransactionCollection(): Promise<
  Collection<UsStockTransactionDocument>
> {
  const client = await clientPromise;
  return client
    .db()
    .collection<UsStockTransactionDocument>(US_STOCK_TRANSACTION_COLLECTION);
}

export async function listUsStockTransactions(
  userId: string,
  familyMemberId: ObjectId,
) {
  const collection = await getUsStockTransactionCollection();
  return collection
    .find({ userId, familyMemberId })
    .sort({ occurredAt: -1 })
    .limit(200)
    .toArray();
}

export function serializeUsStockTransaction(
  document: WithId<UsStockTransactionDocument>,
) {
  return {
    id: document._id.toHexString(),
    stockCode: document.stockCode,
    stockName: document.stockName,
    assetType: document.assetType,
    side: document.side,
    shares: document.shares,
    price: document.price,
    grossAmount: document.grossAmount,
    transactionFee: document.transactionFee,
    secFee: document.secFee,
    tafFee: document.tafFee,
    cashAmount: document.cashAmount,
    costBasisReduction: document.costBasisReduction,
    realizedProfitLoss: document.realizedProfitLoss,
    afterShares: document.afterShares,
    afterPrincipal: document.afterPrincipal,
    occurredAt: document.occurredAt.toISOString(),
    createdAt: document.createdAt.toISOString(),
  };
}

export async function applyAndRecordUsStockTrade(
  userId: string,
  familyMemberId: ObjectId,
  input: UsStockTradeInput,
  stock: Pick<UsStockPositionDocument, "stockCode" | "stockName" | "assetType">,
  calculation: UsStockTradeCalculation,
): Promise<RecordedUsStockTradeResult> {
  const client = await clientPromise;
  const session = client.startSession();
  let outcome: RecordedUsStockTradeResult | undefined;

  try {
    await session.withTransaction(async () => {
      const tradeResult = await applyUsStockTrade(
        userId,
        familyMemberId,
        input,
        stock,
        calculation,
        session,
      );

      if (tradeResult.status !== "success") {
        outcome = tradeResult;
        return;
      }

      const now = new Date();
      const document: UsStockTransactionDocument = {
        userId,
        familyMemberId,
        stockCode: stock.stockCode,
        stockName: stock.stockName,
        assetType: stock.assetType,
        side: input.side,
        shares: input.shares,
        price: input.price,
        ...calculation,
        costBasisReduction: tradeResult.costBasisReduction,
        realizedProfitLoss: tradeResult.realizedProfitLoss,
        afterShares: tradeResult.document?.shares ?? 0,
        afterPrincipal: tradeResult.document?.principal ?? 0,
        occurredAt: now,
        createdAt: now,
      };
      const collection = await getUsStockTransactionCollection();
      const insertResult = await collection.insertOne(document, { session });
      const transaction = await collection.findOne(
        { _id: insertResult.insertedId, userId, familyMemberId },
        { session },
      );

      if (!transaction) {
        throw new Error("新增後無法依交易 ID 查回驗證");
      }

      outcome = { ...tradeResult, transaction };
    });
  } finally {
    await session.endSession();
  }

  if (!outcome) {
    throw new Error("美股交易未產生結果");
  }

  return outcome;
}
