import {
  type Collection,
  type IndexDescription,
  type ObjectId,
  type WithId,
} from "mongodb";

import clientPromise from "@/lib/mongodb";

export const US_ECONOMIC_EVENT_COLLECTION = "usEconomicEvents";
export const US_ECONOMIC_EVENT_TYPES = ["FOMC", "CPI", "PPI", "PCE"] as const;
export const US_ECONOMIC_EVENT_AGENCIES = [
  "Federal Reserve",
  "BLS",
  "BEA",
] as const;

export type UsEconomicEventType = (typeof US_ECONOMIC_EVENT_TYPES)[number];
export type UsEconomicEventAgency =
  (typeof US_ECONOMIC_EVENT_AGENCIES)[number];

export interface UsEconomicEventDocument {
  eventKey: string;
  eventType: UsEconomicEventType;
  referencePeriod: string;
  sourcePeriodLabel: string;
  sourceReleaseName: string;
  releaseAt: Date;
  sourceLocalDate: string;
  sourceLocalTime: string;
  sourceTimeZone: "America/New_York";
  sourceAgency: UsEconomicEventAgency;
  sourceUrl: string;
  hasProjections: boolean;
  sourcePageHash: string;
  fetchedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type UsEconomicEventInput = Omit<
  UsEconomicEventDocument,
  "createdAt" | "updatedAt"
>;

export type UsEconomicEventWriteResult = {
  requestedCount: number;
  insertedCount: number;
  modifiedCount: number;
  skippedCount: number;
  verifiedCount: number;
  documents: WithId<UsEconomicEventDocument>[];
};

export const usEconomicEventIndexes: IndexDescription[] = [
  { key: { eventKey: 1 }, name: "eventKey_1", unique: true },
  { key: { releaseAt: 1 }, name: "releaseAt_1" },
  {
    key: { eventType: 1, releaseAt: 1 },
    name: "eventType_1_releaseAt_1",
  },
];

export const usEconomicEventJsonSchema = {
  bsonType: "object",
  required: [
    "eventKey",
    "eventType",
    "referencePeriod",
    "sourcePeriodLabel",
    "sourceReleaseName",
    "releaseAt",
    "sourceLocalDate",
    "sourceLocalTime",
    "sourceTimeZone",
    "sourceAgency",
    "sourceUrl",
    "hasProjections",
    "sourcePageHash",
    "fetchedAt",
    "createdAt",
    "updatedAt",
  ],
  additionalProperties: false,
  properties: {
    _id: { bsonType: "objectId" },
    eventKey: {
      bsonType: "string",
      pattern: "^(FOMC|CPI|PPI|PCE):[0-9]{4}-[0-9]{2}$",
      maxLength: 40,
    },
    eventType: { enum: US_ECONOMIC_EVENT_TYPES },
    referencePeriod: {
      bsonType: "string",
      pattern: "^[0-9]{4}-[0-9]{2}$",
    },
    sourcePeriodLabel: { bsonType: "string", minLength: 1, maxLength: 80 },
    sourceReleaseName: { bsonType: "string", minLength: 1, maxLength: 120 },
    releaseAt: { bsonType: "date" },
    sourceLocalDate: {
      bsonType: "string",
      pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
    },
    sourceLocalTime: {
      bsonType: "string",
      pattern: "^[0-9]{2}:[0-9]{2}$",
    },
    sourceTimeZone: { enum: ["America/New_York"] },
    sourceAgency: { enum: US_ECONOMIC_EVENT_AGENCIES },
    sourceUrl: {
      bsonType: "string",
      pattern: "^https://",
      maxLength: 500,
    },
    hasProjections: { bsonType: "bool" },
    sourcePageHash: {
      bsonType: "string",
      pattern: "^[a-f0-9]{64}$",
    },
    fetchedAt: { bsonType: "date" },
    createdAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" },
  },
} as const;

export async function getUsEconomicEventCollection(): Promise<
  Collection<UsEconomicEventDocument>
> {
  const client = await clientPromise;
  return client
    .db()
    .collection<UsEconomicEventDocument>(US_ECONOMIC_EVENT_COLLECTION);
}

export async function listUpcomingUsEconomicEvents(now = new Date()) {
  const collection = await getUsEconomicEventCollection();
  return collection.find({ releaseAt: { $gte: now } }).sort({ releaseAt: 1 }).toArray();
}

export async function countUsEconomicEvents() {
  const collection = await getUsEconomicEventCollection();
  return collection.countDocuments({});
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseUsEconomicEventInput(
  value: unknown,
): UsEconomicEventInput {
  if (!isRecord(value)) {
    throw new TypeError("經濟事件必須是 object");
  }

  const expectedKeys = [
    "eventKey",
    "eventType",
    "referencePeriod",
    "sourcePeriodLabel",
    "sourceReleaseName",
    "releaseAt",
    "sourceLocalDate",
    "sourceLocalTime",
    "sourceTimeZone",
    "sourceAgency",
    "sourceUrl",
    "hasProjections",
    "sourcePageHash",
    "fetchedAt",
  ] as const;

  if (Object.keys(value).some((key) => !expectedKeys.includes(key as (typeof expectedKeys)[number]))) {
    throw new TypeError("經濟事件包含未定義欄位");
  }

  const eventType = value.eventType;
  const referencePeriod = value.referencePeriod;
  const releaseAt = value.releaseAt;
  const fetchedAt = value.fetchedAt;

  if (
    typeof eventType !== "string" ||
    !US_ECONOMIC_EVENT_TYPES.includes(eventType as UsEconomicEventType)
  ) {
    throw new TypeError("eventType 不正確");
  }
  if (
    typeof referencePeriod !== "string" ||
    !/^[0-9]{4}-[0-9]{2}$/.test(referencePeriod)
  ) {
    throw new TypeError("referencePeriod 不正確");
  }
  if (value.eventKey !== `${eventType}:${referencePeriod}`) {
    throw new TypeError("eventKey 必須由 eventType 與 referencePeriod 組成");
  }
  if (!(releaseAt instanceof Date) || Number.isNaN(releaseAt.getTime())) {
    throw new TypeError("releaseAt 必須是有效日期");
  }
  if (!(fetchedAt instanceof Date) || Number.isNaN(fetchedAt.getTime())) {
    throw new TypeError("fetchedAt 必須是有效日期");
  }
  if (
    typeof value.sourcePeriodLabel !== "string" ||
    value.sourcePeriodLabel.length < 1 ||
    value.sourcePeriodLabel.length > 80
  ) {
    throw new TypeError("sourcePeriodLabel 不正確");
  }
  if (
    typeof value.sourceReleaseName !== "string" ||
    value.sourceReleaseName.length < 1 ||
    value.sourceReleaseName.length > 120
  ) {
    throw new TypeError("sourceReleaseName 不正確");
  }
  if (
    typeof value.sourceLocalDate !== "string" ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value.sourceLocalDate)
  ) {
    throw new TypeError("sourceLocalDate 不正確");
  }
  if (
    typeof value.sourceLocalTime !== "string" ||
    !/^[0-9]{2}:[0-9]{2}$/.test(value.sourceLocalTime)
  ) {
    throw new TypeError("sourceLocalTime 不正確");
  }
  if (value.sourceTimeZone !== "America/New_York") {
    throw new TypeError("sourceTimeZone 不正確");
  }
  if (
    typeof value.sourceAgency !== "string" ||
    !US_ECONOMIC_EVENT_AGENCIES.includes(
      value.sourceAgency as UsEconomicEventAgency,
    )
  ) {
    throw new TypeError("sourceAgency 不正確");
  }
  if (
    typeof value.sourceUrl !== "string" ||
    !value.sourceUrl.startsWith("https://") ||
    value.sourceUrl.length > 500
  ) {
    throw new TypeError("sourceUrl 不正確");
  }
  if (typeof value.hasProjections !== "boolean") {
    throw new TypeError("hasProjections 不正確");
  }
  if (
    typeof value.sourcePageHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.sourcePageHash)
  ) {
    throw new TypeError("sourcePageHash 不正確");
  }

  return value as UsEconomicEventInput;
}

function hasMaterialChange(
  existing: WithId<UsEconomicEventDocument>,
  input: UsEconomicEventInput,
) {
  return (
    existing.eventType !== input.eventType ||
    existing.referencePeriod !== input.referencePeriod ||
    existing.sourcePeriodLabel !== input.sourcePeriodLabel ||
    existing.sourceReleaseName !== input.sourceReleaseName ||
    existing.releaseAt.getTime() !== input.releaseAt.getTime() ||
    existing.sourceLocalDate !== input.sourceLocalDate ||
    existing.sourceLocalTime !== input.sourceLocalTime ||
    existing.sourceTimeZone !== input.sourceTimeZone ||
    existing.sourceAgency !== input.sourceAgency ||
    existing.sourceUrl !== input.sourceUrl ||
    existing.hasProjections !== input.hasProjections ||
    existing.sourcePageHash !== input.sourcePageHash
  );
}

export async function planUsEconomicEventUpserts(rawInputs: unknown[]) {
  const inputs = rawInputs.map(parseUsEconomicEventInput);
  const uniqueKeys = new Set(inputs.map((input) => input.eventKey));
  if (uniqueKeys.size !== inputs.length) {
    throw new TypeError("同一批經濟事件含有重複 eventKey");
  }

  const collection = await getUsEconomicEventCollection();
  const existingDocuments = await collection
    .find({ eventKey: { $in: [...uniqueKeys] } })
    .toArray();
  const existingByKey = new Map(
    existingDocuments.map((document) => [document.eventKey, document]),
  );
  const insertKeys: string[] = [];
  const updateKeys: string[] = [];
  const skipKeys: string[] = [];

  for (const input of inputs) {
    const existing = existingByKey.get(input.eventKey);
    if (!existing) insertKeys.push(input.eventKey);
    else if (hasMaterialChange(existing, input)) updateKeys.push(input.eventKey);
    else skipKeys.push(input.eventKey);
  }

  return { insertKeys, updateKeys, skipKeys };
}

export async function upsertUsEconomicEvents(
  rawInputs: unknown[],
): Promise<UsEconomicEventWriteResult> {
  const inputs = rawInputs.map(parseUsEconomicEventInput);
  const uniqueKeys = new Set(inputs.map((input) => input.eventKey));
  if (uniqueKeys.size !== inputs.length) {
    throw new TypeError("同一批經濟事件含有重複 eventKey");
  }

  const client = await clientPromise;
  const collection = client
    .db()
    .collection<UsEconomicEventDocument>(US_ECONOMIC_EVENT_COLLECTION);
  const session = client.startSession();
  let insertedCount = 0;
  let modifiedCount = 0;
  let skippedCount = 0;
  let affectedIds: ObjectId[] = [];

  try {
    await session.withTransaction(async () => {
      const now = new Date();
      const existingDocuments = await collection
        .find(
          { eventKey: { $in: [...uniqueKeys] } },
          { session },
        )
        .toArray();
      const existingByKey = new Map(
        existingDocuments.map((document) => [document.eventKey, document]),
      );
      const ids: ObjectId[] = [];

      for (const input of inputs) {
        const existing = existingByKey.get(input.eventKey);
        if (!existing) {
          const result = await collection.insertOne(
            { ...input, createdAt: now, updatedAt: now },
            { session },
          );
          ids.push(result.insertedId);
          insertedCount += 1;
          continue;
        }

        ids.push(existing._id);
        if (!hasMaterialChange(existing, input)) {
          skippedCount += 1;
          continue;
        }

        const result = await collection.updateOne(
          { _id: existing._id },
          { $set: { ...input, updatedAt: now } },
          { session },
        );
        if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
          throw new Error(`經濟事件更新結果不正確：${input.eventKey}`);
        }
        modifiedCount += 1;
      }

      const verifiedCount = await collection.countDocuments(
        { _id: { $in: ids } },
        { session },
      );
      if (verifiedCount !== ids.length) {
        throw new Error("經濟事件交易內查回數量不正確");
      }
      affectedIds = ids;
    });
  } finally {
    await session.endSession();
  }

  const documents = await collection
    .find({ _id: { $in: affectedIds } })
    .sort({ releaseAt: 1 })
    .toArray();
  if (documents.length !== inputs.length) {
    throw new Error("經濟事件交易後無法依 _id 完整查回");
  }

  return {
    requestedCount: inputs.length,
    insertedCount,
    modifiedCount,
    skippedCount,
    verifiedCount: documents.length,
    documents,
  };
}

export function serializeUsEconomicEvent(
  document: WithId<UsEconomicEventDocument>,
) {
  return {
    id: document._id.toHexString(),
    eventKey: document.eventKey,
    eventType: document.eventType,
    referencePeriod: document.referencePeriod,
    sourcePeriodLabel: document.sourcePeriodLabel,
    sourceReleaseName: document.sourceReleaseName,
    releaseAt: document.releaseAt.toISOString(),
    sourceLocalDate: document.sourceLocalDate,
    sourceLocalTime: document.sourceLocalTime,
    sourceAgency: document.sourceAgency,
    sourceUrl: document.sourceUrl,
    hasProjections: document.hasProjections,
    fetchedAt: document.fetchedAt.toISOString(),
  };
}
