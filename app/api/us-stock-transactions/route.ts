import { MongoServerError } from "mongodb";
import { NextResponse } from "next/server";

import {
  familyMemberRequiredResponse,
  getAuthenticatedPortfolioContext,
  unauthorizedResponse,
} from "@/lib/auth-session";
import { findUsStockProfile, UsStockServiceError } from "@/lib/us-stock";
import { serializeUsStockPositionsWithValuations } from "@/lib/us-stock-position-view";
import {
  calculateUsStockTrade,
  findUsStockPositionByCode,
  parseUsStockTradeInput,
} from "@/models/UsStockPosition";
import {
  applyAndRecordUsStockTrade,
  listUsStockTransactions,
  serializeUsStockTransaction,
} from "@/models/UsStockTransaction";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const context = await getAuthenticatedPortfolioContext(request.headers);
    if (!context) return unauthorizedResponse();
    if (!context.familyMemberId) return familyMemberRequiredResponse();

    const transactions = await listUsStockTransactions(
      context.userId,
      context.familyMemberId,
    );

    return NextResponse.json({
      items: transactions.map(serializeUsStockTransaction),
    });
  } catch (error) {
    console.error("Failed to list US stock transactions", error);
    return NextResponse.json(
      { error: "讀取美股交易紀錄失敗" },
      { status: 500 },
    );
  }
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

    const input = parseUsStockTradeInput(body);
    const existing = await findUsStockPositionByCode(
      context.userId,
      context.familyMemberId,
      input.stockCode,
    );

    if (input.side === "sell" && !existing) {
      return NextResponse.json(
        { error: "目前庫存中沒有此美股代號，無法賣出" },
        { status: 404 },
      );
    }

    const marketStock =
      existing ??
      (input.side === "buy" ? await findUsStockProfile(input.stockCode) : null);

    if (!marketStock) {
      return NextResponse.json(
        { error: "找不到此美股或 ETF 代號" },
        { status: 404 },
      );
    }

    const calculation = calculateUsStockTrade(input);
    const result = await applyAndRecordUsStockTrade(
      context.userId,
      context.familyMemberId,
      input,
      {
        stockCode: marketStock.stockCode,
        stockName: marketStock.stockName,
        assetType: marketStock.assetType,
      },
      calculation,
    );

    if (result.status === "notFound") {
      return NextResponse.json(
        { error: "目前庫存中沒有此美股代號，無法賣出" },
        { status: 404 },
      );
    }

    if (result.status === "insufficientShares") {
      return NextResponse.json(
        {
          error: `庫存只有 ${result.availableShares} 股，無法賣出 ${input.shares} 股`,
        },
        { status: 409 },
      );
    }

    if (result.status === "conflict") {
      return NextResponse.json(
        { error: "庫存已被其他交易更新，請重新整理後再試" },
        { status: 409 },
      );
    }

    const serialized = result.document
      ? await serializeUsStockPositionsWithValuations([result.document])
      : null;

    return NextResponse.json({
      item: serialized?.items[0] ?? null,
      transaction: serializeUsStockTransaction(result.transaction),
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      upsertedCount: result.upsertedCount,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof UsStockServiceError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    if (error instanceof MongoServerError && error.code === 11000) {
      return NextResponse.json(
        { error: "庫存已被其他交易更新，請重新整理後再試" },
        { status: 409 },
      );
    }

    console.error("Failed to apply US stock transaction", error);
    return NextResponse.json({ error: "美股交易失敗" }, { status: 500 });
  }
}
