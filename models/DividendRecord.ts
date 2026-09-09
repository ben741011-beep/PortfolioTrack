import { type Collection, type WithId } from "mongodb";

import clientPromise from "@/lib/mongodb";
import {
  STOCK_ASSET_TYPES,
  type StockPositionDocument,
} from "@/models/StockPosition";

export const DIVIDEND_RECORD_COLLECTION = "dividendRecords";

export const DIVIDEND_SOURCES = [
  "twseStock",
  "tpexStock",
  "twseEtf",
  "tpexEtf",
] as const;

export type DividendSource = (typeof DIVIDEND_SOURCES)[number];
export type DividendStatus = "pending" | "paid";

export interface DividendRecordDocument {
  stockCode: string;
  stockName: string;
  assetType: StockPositionDocument["assetType"];
  source: DividendSource;
  dividendYear: number;
  exDividendDate: Date;
  recordDate: Date | null;
  paymentDate: Date | null;
  dividendPerShare: number;
  entitledShares: number;
  grossAmount: number;
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

export const dividendRecordJsonSchema = {
  bsonType: "object",
  required: [
    "stockCode",
    "stockName",
    "assetType",
    "source",
    "dividendYear",
    "exDividendDate",
    "recordDate",
    "paymentDate",
    "dividendPerShare",
    "entitledShares",
    "grossAmount",
    "status",
    "lockedAt",
    "sourceUpdatedAt",
    "createdAt",
    "updatedAt",
  ],
  additionalProperties: false,
  properties: {
    _id: { bsonType: "objectId" },
    stockCode: { bsonType: "string", minLength: 1, maxLength: 20 },
    stockName: { bsonType: "string", minLength: 1, maxLength: 100 },
    assetType: { enum: STOCK_ASSET_TYPES },
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
    entitledShares: { bsonType: ["int", "long"], minimum: 1 },
    grossAmount: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
      exclusiveMinimum: true,
    },
    status: { enum: ["pending", "paid"] },
    lockedAt: { bsonType: ["date", "null"] },
    sourceUpdatedAt: { bsonType: "date" },
    createdAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" },
  },
} as const;

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

  if (!collectionInfo?.options?.validator) {
    throw new Error("dividendRecords collection 尚未建立嚴格 validator");
  }

  const collection = database.collection(DIVIDEND_RECORD_COLLECTION);
  const indexes = await collection.indexes();
  const hasUniqueEventIndex = indexes.some(
    (index) =>
      index.name === "source_1_stockCode_1_exDividendDate_1" && index.unique,
  );

  if (!hasUniqueEventIndex) {
    throw new Error("dividendRecords collection 尚未建立事件唯一索引");
  }
}

export async function findDividendRecordsByKeys(keys: DividendRecordKey[]) {
  if (keys.length === 0) {
    return [];
  }

  const collection = await getDividendRecordCollection();
  return collection
    .find({
      $or: keys.map((key) => ({
        source: key.source,
        stockCode: key.stockCode,
        exDividendDate: key.exDividendDate,
      })),
    })
    .toArray();
}

export async function listDividendRecords(stockCodes: string[]) {
  if (stockCodes.length === 0) {
    return [];
  }

  const collection = await getDividendRecordCollection();
  return collection
    .find({ stockCode: { $in: stockCodes } })
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
    source: document.source,
    dividendYear: document.dividendYear,
    exDividendDate: document.exDividendDate.toISOString(),
    recordDate: document.recordDate?.toISOString() ?? null,
    paymentDate: document.paymentDate?.toISOString() ?? null,
    dividendPerShare: document.dividendPerShare,
    entitledShares: document.entitledShares,
    grossAmount: document.grossAmount,
    status: document.status,
    lockedAt: document.lockedAt?.toISOString() ?? null,
    sourceUpdatedAt: document.sourceUpdatedAt.toISOString(),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}
