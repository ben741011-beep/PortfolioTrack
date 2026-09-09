import { NextRequest, NextResponse } from "next/server";

import {
  findTaiwanStock,
  normalizeStockCode,
  StockMarketServiceError,
} from "@/lib/taiwan-stock";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const rawCode = request.nextUrl.searchParams.get("code");

  try {
    const stockCode = normalizeStockCode(rawCode);
    const stock = await findTaiwanStock(stockCode);

    if (!stock) {
      return NextResponse.json(
        { error: "找不到此上市或上櫃股票代號" },
        { status: 404 },
      );
    }

    return NextResponse.json(stock);
  } catch (error) {
    if (error instanceof TypeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof StockMarketServiceError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    console.error("TWSE stock lookup failed", error);
    return NextResponse.json({ error: "股票名稱查詢失敗" }, { status: 500 });
  }
}
