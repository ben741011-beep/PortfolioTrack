import { NextResponse } from "next/server";

import {
  familyMemberRequiredResponse,
  getAuthenticatedPortfolioContext,
  unauthorizedResponse,
} from "@/lib/auth-session";
import { getDailyUsdTwdExchangeRate } from "@/lib/exchange-rate-service";
import { serializeStockPositionsWithValuations } from "@/lib/stock-position-view";
import { serializeUsStockPositionsWithValuations } from "@/lib/us-stock-position-view";
import { ExchangeRateServiceError } from "@/lib/usd-twd-exchange-rate";
import { listStockPositions } from "@/models/StockPosition";
import { listUsStockPositions } from "@/models/UsStockPosition";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const context = await getAuthenticatedPortfolioContext(request.headers);
    if (!context) return unauthorizedResponse();
    if (!context.familyMemberId) return familyMemberRequiredResponse();

    const [taiwanDocuments, usDocuments, exchangeRate] = await Promise.all([
      listStockPositions(context.userId, context.familyMemberId),
      listUsStockPositions(context.userId, context.familyMemberId),
      getDailyUsdTwdExchangeRate(),
    ]);
    const [taiwanItems, usResponse] = await Promise.all([
      serializeStockPositionsWithValuations(taiwanDocuments),
      serializeUsStockPositionsWithValuations(usDocuments),
    ]);
    const taiwanSummary = {
      count: taiwanItems.length,
      totalPrincipal: taiwanItems.reduce(
        (total, item) => total + item.principal,
        0,
      ),
      totalHoldingMarketValue: taiwanItems.reduce(
        (total, item) => total + (item.valuation?.holdingMarketValue ?? 0),
        0,
      ),
      totalUnrealizedProfitLoss: taiwanItems.reduce(
        (total, item) => total + (item.valuation?.unrealizedProfitLoss ?? 0),
        0,
      ),
    };
    const usdToTwd = (value: number) => value * exchangeRate.rate;

    return NextResponse.json({
      summary: {
        count: taiwanSummary.count + usResponse.summary.count,
        totalPrincipal:
          taiwanSummary.totalPrincipal +
          usdToTwd(usResponse.summary.totalPrincipal),
        totalHoldingMarketValue:
          taiwanSummary.totalHoldingMarketValue +
          usdToTwd(usResponse.summary.totalHoldingMarketValue),
        totalUnrealizedProfitLoss:
          taiwanSummary.totalUnrealizedProfitLoss +
          usdToTwd(usResponse.summary.totalUnrealizedProfitLoss),
      },
      exchangeRate,
    });
  } catch (error) {
    if (error instanceof ExchangeRateServiceError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    console.error("Failed to build portfolio summary", error);
    return NextResponse.json(
      { error: "讀取投資組合總覽失敗" },
      { status: 500 },
    );
  }
}
