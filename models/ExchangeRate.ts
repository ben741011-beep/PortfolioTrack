import { type Collection, type WithId } from "mongodb";

import clientPromise from "@/lib/mongodb";

export const EXCHANGE_RATE_COLLECTION = "exchangeRates";
export const USD_TWD_PAIR = "USD/TWD";

export interface ExchangeRateDocument {
  pair: typeof USD_TWD_PAIR;
  rate: number;
  quoteDate: string;
  source: "中央銀行";
  fetchedAt: Date;
}

export type ExchangeRateInput = ExchangeRateDocument;

export const exchangeRateJsonSchema = {
  bsonType: "object",
  required: ["pair", "rate", "quoteDate", "source", "fetchedAt"],
  additionalProperties: false,
  properties: {
    _id: { bsonType: "objectId" },
    pair: { bsonType: "string", enum: [USD_TWD_PAIR] },
    rate: {
      bsonType: ["int", "long", "double", "decimal"],
      minimum: 0,
      exclusiveMinimum: true,
    },
    quoteDate: {
      bsonType: "string",
      pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
    },
    source: { bsonType: "string", enum: ["中央銀行"] },
    fetchedAt: { bsonType: "date" },
  },
} as const;

export async function getExchangeRateCollection(): Promise<
  Collection<ExchangeRateDocument>
> {
  const client = await clientPromise;
  return client
    .db()
    .collection<ExchangeRateDocument>(EXCHANGE_RATE_COLLECTION);
}

export async function findUsdTwdExchangeRate() {
  const collection = await getExchangeRateCollection();
  return collection.findOne({ pair: USD_TWD_PAIR });
}

export async function upsertUsdTwdExchangeRate(
  input: ExchangeRateInput,
): Promise<WithId<ExchangeRateDocument>> {
  const collection = await getExchangeRateCollection();
  const saved = await collection.findOneAndUpdate(
    { pair: USD_TWD_PAIR },
    { $set: input },
    { upsert: true, returnDocument: "after" },
  );

  if (!saved) {
    throw new Error("匯率寫入後無法取得");
  }

  const verified = await collection.findOne({ _id: saved._id });

  if (!verified) {
    throw new Error("匯率寫入後無法依 ID 查回");
  }

  return verified;
}

export function serializeExchangeRate(
  document: WithId<ExchangeRateDocument>,
) {
  return {
    rate: document.rate,
    quoteDate: document.quoteDate,
    source: document.source,
  };
}
