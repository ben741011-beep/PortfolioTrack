import { type ObjectId, type WithId } from "mongodb";

import {
  fetchDividendEventsForPositions,
  fetchUsDividendEventsForPositions,
  type ExternalDividendEvent,
} from "@/lib/dividend-sources";
import {
  applyDividendRecordSyncChanges,
  calculateDividendAmounts,
  findDividendRecordsByKeys,
  hasDividendRecordSyncChanges,
  type DividendRecordDocument,
  type DividendRecordSyncChange,
  type DividendRecordSyncUpdate,
} from "@/models/DividendRecord";
import {
  listStockPositions,
  type StockPositionDocument,
} from "@/models/StockPosition";
import {
  listUsStockPositions,
  type UsStockPositionDocument,
} from "@/models/UsStockPosition";

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
  userId: string,
  familyMemberId: ObjectId,
  position: WithId<StockPositionDocument | UsStockPositionDocument>,
  event: ExternalDividendEvent,
  now: Date,
  today: Date,
): DividendRecordDocument {
  const shouldLock = event.exDividendDate <= today;
  const amounts = calculateDividendAmounts({
    market: event.market,
    dividendPerShare: event.dividendPerShare,
    entitledShares: position.shares,
  });

  return {
    userId,
    familyMemberId,
    stockCode: position.stockCode,
    stockName: position.stockName,
    assetType: position.assetType,
    market: event.market,
    currency: event.market === "us" ? "USD" : "TWD",
    source: event.source,
    dividendYear: event.exDividendDate.getUTCFullYear(),
    exDividendDate: event.exDividendDate,
    recordDate: event.recordDate,
    paymentDate: event.paymentDate,
    dividendPerShare: event.dividendPerShare,
    entitledShares: position.shares,
    ...amounts,
    status: isPaid(event, today) ? "paid" : "pending",
    lockedAt: shouldLock ? now : null,
    sourceUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export async function syncDividendRecords(
  userId: string,
  familyMemberId: ObjectId,
  options?: { dryRun?: boolean },
) {
  const dryRun = options?.dryRun ?? false;
  const [twPositions, usPositions] = await Promise.all([
    listStockPositions(userId, familyMemberId),
    listUsStockPositions(userId, familyMemberId),
  ]);
  const positions = [
    ...twPositions.map((position) => ({ position, market: "tw" as const })),
    ...usPositions.map((position) => ({ position, market: "us" as const })),
  ];
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

  const [twEvents, usEvents] = await Promise.all([
    fetchDividendEventsForPositions(twPositions),
    fetchUsDividendEventsForPositions(usPositions),
  ]);
  const events = [...twEvents, ...usEvents];
  const positionByCode = new Map(
    positions.map(({ position, market }) => [
      `${market}:${position.stockCode}`,
      position,
    ]),
  );
  const existingRecords = await findDividendRecordsByKeys(
    userId,
    familyMemberId,
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
  const changes: DividendRecordSyncChange[] = [];

  for (const event of events) {
    const position = positionByCode.get(`${event.market}:${event.stockCode}`);

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
      changes.push({
        kind: "insert",
        document: toNewDividendRecord(userId, familyMemberId, position, event, now, today),
      });
      continue;
    }

    const entitledShares = existing.lockedAt
      ? existing.entitledShares
      : position.shares;
    const amounts = calculateDividendAmounts({
      market: event.market,
      dividendPerShare: event.dividendPerShare,
      entitledShares,
    });
    const lockedAt =
      existing.lockedAt ?? (event.exDividendDate <= today ? now : null);

    const values = {
      stockName: position.stockName,
      assetType: position.assetType,
      market: event.market,
      currency: event.market === "us" ? "USD" : "TWD",
      dividendYear: event.exDividendDate.getUTCFullYear(),
      recordDate: event.recordDate,
      paymentDate: event.paymentDate,
      dividendPerShare: event.dividendPerShare,
      entitledShares,
      ...amounts,
      status: isPaid(event, today) ? "paid" : "pending",
      lockedAt,
      sourceUpdatedAt: now,
      updatedAt: now,
    } satisfies DividendRecordSyncUpdate;
    if (!hasDividendRecordSyncChanges(existing, values)) continue;

    changes.push({
      kind: "update",
      id: existing._id,
      expectedUpdatedAt: existing.updatedAt,
      values,
    });
  }

  if (dryRun || changes.length === 0) {
    return {
      dryRun,
      positionCount: positions.length,
      fetchedCount: events.length,
      insertedCount: changes.filter((change) => change.kind === "insert")
        .length,
      modifiedCount: 0,
      matchedCount: changes.filter((change) => change.kind === "update")
        .length,
      skippedCount: events.length - changes.length,
      verifiedCount: 0,
      syncedAt: now.toISOString(),
    } satisfies DividendSyncResult;
  }

  const result = await applyDividendRecordSyncChanges(userId, familyMemberId, changes);

  return {
    dryRun,
    positionCount: positions.length,
    fetchedCount: events.length,
    insertedCount: result.insertedCount,
    modifiedCount: result.modifiedCount,
    matchedCount: result.matchedCount,
    skippedCount: events.length - changes.length,
    verifiedCount: result.verifiedCount,
    syncedAt: now.toISOString(),
  } satisfies DividendSyncResult;
}
