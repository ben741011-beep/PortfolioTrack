import { NextResponse } from "next/server";

import {
  familyMemberRequiredResponse,
  getAuthenticatedPortfolioContext,
  unauthorizedResponse,
} from "@/lib/auth-session";
import { DividendSourceError } from "@/lib/dividend-sources";
import { syncDividendRecords } from "@/lib/dividend-sync";
import {
  DividendSyncPersistenceError,
  listDividendRecords,
  serializeDividendRecord,
} from "@/models/DividendRecord";
import { listStockPositions } from "@/models/StockPosition";
import { listUsStockPositions } from "@/models/UsStockPosition";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    const context = await getAuthenticatedPortfolioContext(request.headers);
    if (!context) return unauthorizedResponse();
    if (!context.familyMemberId) return familyMemberRequiredResponse();

    const [positions, usPositions, records] = await Promise.all([
      listStockPositions(context.userId, context.familyMemberId),
      listUsStockPositions(context.userId, context.familyMemberId),
      listDividendRecords(
        context.userId,
        context.familyMemberId,
      ),
    ]);

    return NextResponse.json({
      items: records.map(serializeDividendRecord),
      positions: [
        ...positions.map((position) => ({
          stockCode: position.stockCode,
          stockName: position.stockName,
          principal: position.principal,
          market: "tw",
          currency: "TWD",
        })),
        ...usPositions.map((position) => ({
          stockCode: position.stockCode,
          stockName: position.stockName,
          principal: position.principal,
          market: "us",
          currency: "USD",
        })),
      ],
    });
  } catch (error) {
    console.error("Failed to list dividend records", error);
    return NextResponse.json({ error: "讀取股息紀錄失敗" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await getAuthenticatedPortfolioContext(request.headers);
    if (!context) return unauthorizedResponse();
    if (!context.familyMemberId) return familyMemberRequiredResponse();

    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    const result = await syncDividendRecords(context.userId, context.familyMemberId, { dryRun });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DividendSyncPersistenceError) {
      console.error("Dividend sync persistence result", error.reconciliation);
      return NextResponse.json(
        { error: error.message, reconciliation: error.reconciliation },
        { status: 500 },
      );
    }

    if (error instanceof DividendSourceError) {
      console.error("Failed to fetch dividend sources", error);
      return NextResponse.json(
        { error: "官方股息資料來源暫時無法使用，資料庫未完成更新" },
        { status: 502 },
      );
    }

    console.error("Failed to refresh dividend records", error);
    return NextResponse.json(
      { error: "手動更新股息資料失敗" },
      { status: 500 },
    );
  }
}
