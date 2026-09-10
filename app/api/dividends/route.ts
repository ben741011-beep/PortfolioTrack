import { NextResponse } from "next/server";

import {
  listDividendRecords,
  serializeDividendRecord,
} from "@/models/DividendRecord";
import { listStockPositions } from "@/models/StockPosition";

export const runtime = "nodejs";

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
