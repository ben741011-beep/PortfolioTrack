import { type Collection, type WithId } from "mongodb";

import clientPromise from "@/lib/mongodb";
import {
  applyStockTrade,
  STOCK_ASSET_TYPES,
  type StockPositionDocument,
  type StockTradeCalculation,
  type StockTradeInput,
  type StockTradeResult,
} from "@/models/StockPosition";

export const STOCK_TRANSACTION_COLLECTION = "stockTransactions";

export interface StockTransactionDocument {
  userId: string;
  stockCode: string;
  stockName: string;
  assetType: StockPositionDocument["assetType"];
  side: StockTradeInput["side"];
  shares: number;
  price: number;
  grossAmount: number;
  transactionFee: number;
  transactionTax: number;
  cashAmount: number;
  costBasisReduction: number;
  realizedProfitLoss: number;
  afterShares: number;
  afterPrincipal: number;
  occurredAt: Date;
  createdAt: Date;
}

type SuccessfulStockTradeResult = Extract<StockTradeResult, { status: "success" }>;

export type RecordedStockTradeResult =
  | Exclude<StockTradeResult, { status: "success" }>
  | (SuccessfulStockTradeResult & {
      transaction: WithId<StockTransactionDocument>;
    });

export const stockTransactionJsonSchema = {
  bsonType: "object",
  required: [
    "userId",
    "stockCode",
    "stockName",
    "assetType",
    "side",
    "shares",
    "price",
    "grossAmount",
    "transactionFee",
    "transactionTax",
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
    stockCode: { bsonType: "string", minLength: 1, maxLength: 20 },
    stockName: { bsonType: "string", minLength: 1, maxLength: 100 },
    assetType: { enum: STOCK_ASSET_TYPES },
    side: { enum: ["buy", "sell"] },
    shares: { bsonType: ["int", "long"], minimum: 1 },
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
    transactionTax: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
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
    afterShares: { bsonType: ["int", "long"], minimum: 0 },
    afterPrincipal: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
    },
    occurredAt: { bsonType: "date" },
    createdAt: { bsonType: "date" },
  },
} as const;

export async function getStockTransactionCollection(): Promise<
  Collection<StockTransactionDocument>
> {
  const client = await clientPromise;
  return client
    .db()
    .collection<StockTransactionDocument>(STOCK_TRANSACTION_COLLECTION);
}

export async function listStockTransactions(userId: string) {
  const collection = await getStockTransactionCollection();
  return collection
    .find({ userId })
    .sort({ occurredAt: -1 })
    .limit(200)
    .toArray();
}

export function serializeStockTransaction(
  document: WithId<StockTransactionDocument>,
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
    transactionTax: document.transactionTax,
    cashAmount: document.cashAmount,
    costBasisReduction: document.costBasisReduction,
    realizedProfitLoss: document.realizedProfitLoss,
    afterShares: document.afterShares,
    afterPrincipal: document.afterPrincipal,
    occurredAt: document.occurredAt.toISOString(),
    createdAt: document.createdAt.toISOString(),
  };
}

export async function applyAndRecordStockTrade(
  userId: string,
  input: StockTradeInput,
  stock: Pick<StockPositionDocument, "stockCode" | "stockName" | "assetType">,
  calculation: StockTradeCalculation,
): Promise<RecordedStockTradeResult> {
  const client = await clientPromise;
  const session = client.startSession();
  let outcome: RecordedStockTradeResult | undefined;

  try {
    await session.withTransaction(async () => {
      const tradeResult = await applyStockTrade(
        userId,
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
      const document: StockTransactionDocument = {
        userId,
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
      const collection = await getStockTransactionCollection();
      const insertResult = await collection.insertOne(document, { session });
      const transaction = await collection.findOne(
        { _id: insertResult.insertedId, userId },
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
    throw new Error("交易未產生執行結果");
  }

  return outcome;
}
