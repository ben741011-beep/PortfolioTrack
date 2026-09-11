import { NextResponse } from "next/server";

import { DividendSourceError } from "@/lib/dividend-sources";
import { syncDividendRecords } from "@/lib/dividend-sync";
import {
  listDividendRecords,
  serializeDividendRecord,
} from "@/models/DividendRecord";
import { listStockPositions } from "@/models/StockPosition";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try {
    const positions = await listStockPositions();
    const records = await listDividendRecords(
      positions.map((position) => position.stockCode),
    );

    return NextResponse.json({
      items: records.map(serializeDividendRecord),
      positions: positions.map((position) => ({
        stockCode: position.stockCode,
        stockName: position.stockName,
        principal: position.principal,
      })),
    });
  } catch (error) {
    console.error("Failed to list dividend records", error);
    return NextResponse.json({ error: "讀取股息紀錄失敗" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    const result = await syncDividendRecords({ dryRun });

    return NextResponse.json(result);
  } catch (error) {
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
