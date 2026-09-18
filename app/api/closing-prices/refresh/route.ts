import { NextResponse } from "next/server";

import {
  familyMemberRequiredResponse,
  getAuthenticatedPortfolioContext,
  unauthorizedResponse,
} from "@/lib/auth-session";
import { refreshTwMarketQuotes } from "@/lib/stock-valuation";
import { refreshUsMarketQuotes } from "@/lib/us-stock-valuation";
import { listStockPositions } from "@/models/StockPosition";
import { listUsStockPositions } from "@/models/UsStockPosition";

export const runtime = "nodejs";

type InventoryMarket = "tw" | "us";

function parseMarket(value: unknown): InventoryMarket {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Request body 必須是 JSON object");
  }

  const input = value as Record<string, unknown>;

  if (Object.keys(input).some((key) => key !== "market")) {
    throw new TypeError("只接受 market 欄位");
  }

  if (input.market !== "tw" && input.market !== "us") {
    throw new TypeError("market 必須是 tw 或 us");
  }

  return input.market;
}

export async function POST(request: Request) {
  try {
    const context = await getAuthenticatedPortfolioContext(request.headers);
    if (!context) return unauthorizedResponse();
    if (!context.familyMemberId) return familyMemberRequiredResponse();

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body 必須是有效的 JSON" },
        { status: 400 },
      );
    }

    const market = parseMarket(body);
    const documents =
      market === "tw"
        ? await listStockPositions(context.userId, context.familyMemberId)
        : await listUsStockPositions(context.userId, context.familyMemberId);
    const stockCodes = documents.map((document) => document.stockCode);
    const quotes =
      market === "tw"
        ? await refreshTwMarketQuotes(stockCodes)
        : await refreshUsMarketQuotes(stockCodes);
    const items = [...quotes].map(([stockCode, quote]) => ({
      stockCode,
      ...quote,
    }));
    const failedStockCodes = stockCodes.filter(
      (stockCode) => !quotes.has(stockCode),
    );

    if (stockCodes.length > 0 && items.length === 0) {
      return NextResponse.json(
        {
          error:
            market === "tw"
              ? "無法取得台股最新報價，資料庫未更新"
              : "無法取得美股最新報價，資料庫未更新",
          requestedCount: stockCodes.length,
          updatedCount: 0,
          failedStockCodes,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      market,
      requestedCount: stockCodes.length,
      updatedCount: items.length,
      failedStockCodes,
      items,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to refresh stock prices", error);
    return NextResponse.json(
      { error: "更新行情失敗，資料庫未完成更新" },
      { status: 500 },
    );
  }
}
