import { type Collection, type WithId } from "mongodb";

import clientPromise from "@/lib/mongodb";

export const STOCK_CLOSING_PRICE_COLLECTION = "stockClosingPrices";

export interface StockClosingPriceDocument {
  stockCode: string;
  close: number;
  quoteDate: string;
  fetchedAt: Date;
}

export type StockClosingPriceInput = Omit<
  StockClosingPriceDocument,
  "fetchedAt"
>;

export const stockClosingPriceJsonSchema = {
  bsonType: "object",
  required: ["stockCode", "close", "quoteDate", "fetchedAt"],
  additionalProperties: false,
  properties: {
    _id: { bsonType: "objectId" },
    stockCode: { bsonType: "string", minLength: 1, maxLength: 20 },
    close: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
      exclusiveMinimum: true,
    },
    quoteDate: {
      bsonType: "string",
      pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
    },
    fetchedAt: { bsonType: "date" },
  },
} as const;

export async function getStockClosingPriceCollection(): Promise<
  Collection<StockClosingPriceDocument>
> {
  const client = await clientPromise;
  return client
    .db()
    .collection<StockClosingPriceDocument>(STOCK_CLOSING_PRICE_COLLECTION);
}

export async function listStockClosingPrices(stockCodes: string[]) {
  if (stockCodes.length === 0) {
    return [];
  }

  const collection = await getStockClosingPriceCollection();
  return collection
    .find({
      stockCode: { $in: stockCodes },
    })
    .toArray();
}

export async function upsertStockClosingPrices(
  quotes: StockClosingPriceInput[],
): Promise<WithId<StockClosingPriceDocument>[]> {
  if (quotes.length === 0) {
    return [];
  }

  const collection = await getStockClosingPriceCollection();
  const fetchedAt = new Date();

  return Promise.all(
    quotes.map(async (quote) => {
      const saved = await collection.findOneAndUpdate(
        { stockCode: quote.stockCode },
        { $set: { ...quote, fetchedAt } },
        { upsert: true, returnDocument: "after" },
      );

      if (!saved) {
        throw new Error(`收盤價寫入後無法取得：${quote.stockCode}`);
      }

      const verified = await collection.findOne({ _id: saved._id });

      if (!verified) {
        throw new Error(`收盤價寫入後無法依 ID 查回：${quote.stockCode}`);
      }

      return verified;
    }),
  );
}
