import { ObjectId, type AnyBulkWriteOperation, type WithId } from "mongodb";

import {
  fetchDividendEventsForPositions,
  type ExternalDividendEvent,
} from "@/lib/dividend-sources";
import {
  assertDividendRecordCollectionReady,
  findDividendRecordsByKeys,
  getDividendRecordCollection,
  type DividendRecordDocument,
} from "@/models/DividendRecord";
import {
  listStockPositions,
  type StockPositionDocument,
} from "@/models/StockPosition";

export interface DividendSyncResult {
  dryRun: boolean;
  positionCount: number;
  fetchedCount: number;
  insertedCount: number;
  modifiedCount: number;
  matchedCount: number;
  skippedCount: number;
  verifiedCount: number;
  syncedAt: string;
}

function roundAmount(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function getTaipeiTodayUtc(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return new Date(
    Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)),
  );
}

function isPaid(event: ExternalDividendEvent, today: Date) {
  const effectiveDate = event.paymentDate ?? event.exDividendDate;

  return effectiveDate <= today;
}

function makeRecordKey(
  source: DividendRecordDocument["source"],
  stockCode: string,
  exDividendDate: Date,
) {
  return `${source}:${stockCode}:${exDividendDate.toISOString()}`;
}

function toNewDividendRecord(
  position: WithId<StockPositionDocument>,
  event: ExternalDividendEvent,
  now: Date,
  today: Date,
): DividendRecordDocument {
  const shouldLock = event.exDividendDate <= today;

  return {
    stockCode: position.stockCode,
    stockName: position.stockName,
    assetType: position.assetType,
    source: event.source,
    dividendYear: event.exDividendDate.getUTCFullYear(),
    exDividendDate: event.exDividendDate,
    recordDate: event.recordDate,
    paymentDate: event.paymentDate,
    dividendPerShare: event.dividendPerShare,
    entitledShares: position.shares,
    grossAmount: roundAmount(event.dividendPerShare * position.shares),
    status: isPaid(event, today) ? "paid" : "pending",
    lockedAt: shouldLock ? now : null,
    sourceUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export async function syncDividendRecords(options?: { dryRun?: boolean }) {
  const dryRun = options?.dryRun ?? false;
  const positions = await listStockPositions();
  const now = new Date();
  const today = getTaipeiTodayUtc(now);

  if (positions.length === 0) {
    return {
      dryRun,
      positionCount: 0,
      fetchedCount: 0,
      insertedCount: 0,
      modifiedCount: 0,
      matchedCount: 0,
      skippedCount: 0,
      verifiedCount: 0,
      syncedAt: now.toISOString(),
    } satisfies DividendSyncResult;
  }

  const events = await fetchDividendEventsForPositions(positions);
  const positionByCode = new Map(
    positions.map((position) => [position.stockCode, position]),
  );
  const existingRecords = await findDividendRecordsByKeys(
    events.map((event) => ({
      source: event.source,
      stockCode: event.stockCode,
      exDividendDate: event.exDividendDate,
    })),
  );
  const existingByKey = new Map(
    existingRecords.map((record) => [
      makeRecordKey(record.source, record.stockCode, record.exDividendDate),
      record,
    ]),
  );
  const operations: AnyBulkWriteOperation<DividendRecordDocument>[] = [];
  const affectedIds: ObjectId[] = [];

  for (const event of events) {
    const position = positionByCode.get(event.stockCode);

    if (!position) {
      continue;
    }

    const key = makeRecordKey(
      event.source,
      event.stockCode,
      event.exDividendDate,
    );
    const existing = existingByKey.get(key);

    if (!existing) {
      const insertedId = new ObjectId();
      operations.push({
        insertOne: {
          document: {
            _id: insertedId,
            ...toNewDividendRecord(position, event, now, today),
          },
        },
      });
      affectedIds.push(insertedId);
      continue;
    }

    const entitledShares = existing.lockedAt
      ? existing.entitledShares
      : position.shares;
    const lockedAt =
      existing.lockedAt ?? (event.exDividendDate <= today ? now : null);

    operations.push({
      updateOne: {
        filter: { _id: existing._id },
        update: {
          $set: {
            stockName: position.stockName,
            assetType: position.assetType,
            dividendYear: event.exDividendDate.getUTCFullYear(),
            recordDate: event.recordDate,
            paymentDate: event.paymentDate,
            dividendPerShare: event.dividendPerShare,
            entitledShares,
            grossAmount: roundAmount(event.dividendPerShare * entitledShares),
            status: isPaid(event, today) ? "paid" : "pending",
            lockedAt,
            sourceUpdatedAt: now,
            updatedAt: now,
          },
        },
      },
    });
    affectedIds.push(existing._id);
  }

  if (dryRun || operations.length === 0) {
    return {
      dryRun,
      positionCount: positions.length,
      fetchedCount: events.length,
      insertedCount: operations.filter((operation) => "insertOne" in operation)
        .length,
      modifiedCount: 0,
      matchedCount: operations.filter((operation) => "updateOne" in operation)
        .length,
      skippedCount: events.length - operations.length,
      verifiedCount: 0,
      syncedAt: now.toISOString(),
    } satisfies DividendSyncResult;
  }

  await assertDividendRecordCollectionReady();
  const collection = await getDividendRecordCollection();
  const result = await collection.bulkWrite(operations, { ordered: false });
  const verifiedDocuments = await Promise.all(
    affectedIds.map((id) => collection.findOne({ _id: id })),
  );

  if (verifiedDocuments.some((document) => !document)) {
    throw new Error("股息資料寫入後無法依 _id 完整查回驗證");
  }

  return {
    dryRun,
    positionCount: positions.length,
    fetchedCount: events.length,
    insertedCount: result.insertedCount,
    modifiedCount: result.modifiedCount,
    matchedCount: result.matchedCount,
    skippedCount: events.length - operations.length,
    verifiedCount: verifiedDocuments.length,
    syncedAt: now.toISOString(),
  } satisfies DividendSyncResult;
}
