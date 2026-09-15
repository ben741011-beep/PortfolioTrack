import { ObjectId, type Collection, type WithId } from "mongodb";

import clientPromise from "@/lib/mongodb";
import {
  STOCK_ASSET_TYPES,
  type StockPositionDocument,
} from "@/models/StockPosition";

export const DIVIDEND_RECORD_COLLECTION = "dividendRecords";
export const DIVIDEND_START_YEAR = 2025;

export const DIVIDEND_SOURCES = [
  "twseStock",
  "tpexStock",
  "twseEtf",
  "tpexEtf",
  "yahooUs",
] as const;

export type DividendSource = (typeof DIVIDEND_SOURCES)[number];
export type DividendStatus = "pending" | "paid";
export type DividendMarket = "tw" | "us";
export type DividendCurrency = "TWD" | "USD";

export const US_DIVIDEND_WITHHOLDING_TAX_RATE = 0.3;

export interface DividendRecordDocument {
  userId: string;
  familyMemberId: ObjectId;
  stockCode: string;
  stockName: string;
  assetType: StockPositionDocument["assetType"];
  market: DividendMarket;
  currency: DividendCurrency;
  source: DividendSource;
  dividendYear: number;
  exDividendDate: Date;
  recordDate: Date | null;
  paymentDate: Date | null;
  dividendPerShare: number;
  entitledShares: number;
  grossAmount: number;
  withholdingTaxRate: number;
  withholdingTax: number;
  netAmount: number;
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
    "userId",
    "familyMemberId",
    "stockCode",
    "stockName",
    "assetType",
    "market",
    "currency",
    "source",
    "dividendYear",
    "exDividendDate",
    "recordDate",
    "paymentDate",
    "dividendPerShare",
    "entitledShares",
    "grossAmount",
    "withholdingTaxRate",
    "withholdingTax",
    "netAmount",
    "status",
    "lockedAt",
    "sourceUpdatedAt",
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
    market: { enum: ["tw", "us"] },
    currency: { enum: ["TWD", "USD"] },
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
    entitledShares: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
      exclusiveMinimum: true,
    },
    grossAmount: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
      exclusiveMinimum: true,
    },
    withholdingTaxRate: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
      maximum: 1,
    },
    withholdingTax: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
    },
    netAmount: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
    },
    status: { enum: ["pending", "paid"] },
    lockedAt: { bsonType: ["date", "null"] },
    sourceUpdatedAt: { bsonType: "date" },
    createdAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" },
  },
} as const;

function roundTo(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function calculateDividendAmounts(input: {
  market: DividendMarket;
  dividendPerShare: number;
  entitledShares: number;
}) {
  const rawGrossAmount = input.dividendPerShare * input.entitledShares;
  const grossAmount = roundTo(rawGrossAmount, input.market === "us" ? 2 : 6);
  const withholdingTaxRate =
    input.market === "us" ? US_DIVIDEND_WITHHOLDING_TAX_RATE : 0;
  const withholdingTax =
    input.market === "us"
      ? roundTo(grossAmount * withholdingTaxRate, 2)
      : 0;
  const netAmount =
    input.market === "us"
      ? roundTo(grossAmount - withholdingTax, 2)
      : grossAmount;

  return { grossAmount, withholdingTaxRate, withholdingTax, netAmount };
}

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
      index.name ===
        "userId_1_familyMemberId_1_source_1_stockCode_1_exDividendDate_1" && index.unique,
  );

  if (!hasUniqueEventIndex) {
    throw new Error("dividendRecords collection 尚未建立事件唯一索引");
  }
}

export async function findDividendRecordsByKeys(
  userId: string,
  familyMemberId: ObjectId,
  keys: DividendRecordKey[],
) {
  if (keys.length === 0) {
    return [];
  }

  const collection = await getDividendRecordCollection();
  return collection
    .find({
      userId,
      familyMemberId,
      $or: keys.map((key) => ({
        source: key.source,
        stockCode: key.stockCode,
        exDividendDate: key.exDividendDate,
      })),
    })
    .toArray();
}

export async function listDividendRecords(
  userId: string,
  familyMemberId: ObjectId,
) {
  const collection = await getDividendRecordCollection();
  return collection
    .find({
      userId,
      familyMemberId,
      dividendYear: { $gte: DIVIDEND_START_YEAR },
    })
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
    market: document.market,
    currency: document.currency,
    source: document.source,
    dividendYear: document.dividendYear,
    exDividendDate: document.exDividendDate.toISOString(),
    recordDate: document.recordDate?.toISOString() ?? null,
    paymentDate: document.paymentDate?.toISOString() ?? null,
    dividendPerShare: document.dividendPerShare,
    entitledShares: document.entitledShares,
    grossAmount: document.grossAmount,
    withholdingTaxRate: document.withholdingTaxRate,
    withholdingTax: document.withholdingTax,
    netAmount: document.netAmount,
    status: document.status,
    lockedAt: document.lockedAt?.toISOString() ?? null,
    sourceUpdatedAt: document.sourceUpdatedAt.toISOString(),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}
