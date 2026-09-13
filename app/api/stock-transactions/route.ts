import { MongoServerError } from "mongodb";
import { NextResponse } from "next/server";

import {
  getAuthenticatedUserId,
  unauthorizedResponse,
} from "@/lib/auth-session";
import {
  findTaiwanStock,
  StockMarketServiceError,
} from "@/lib/taiwan-stock";
import { serializeStockPositionsWithValuations } from "@/lib/stock-position-view";
import {
  calculateStockTrade,
  findStockPositionByCode,
  parseStockTradeInput,
} from "@/models/StockPosition";
import {
  applyAndRecordStockTrade,
  listStockTransactions,
  serializeStockTransaction,
} from "@/models/StockTransaction";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    if (!userId) return unauthorizedResponse();

    const transactions = await listStockTransactions(userId);
    return NextResponse.json({
      items: transactions.map(serializeStockTransaction),
    });
  } catch (error) {
    console.error("Failed to list stock transactions", error);
    return NextResponse.json({ error: "讀取股票交易紀錄失敗" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    if (!userId) return unauthorizedResponse();

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body 必須是有效的 JSON" },
        { status: 400 },
      );
    }

    const input = parseStockTradeInput(body);
    const existing = await findStockPositionByCode(userId, input.stockCode);

    if (input.side === "sell" && !existing) {
      return NextResponse.json(
        { error: "目前庫存中沒有此股票代號，無法賣出" },
        { status: 404 },
      );
    }

    const marketStock =
      existing ??
      (input.side === "buy" ? await findTaiwanStock(input.stockCode) : null);

    if (!marketStock) {
      return NextResponse.json(
        { error: "找不到此上市或上櫃股票代號" },
        { status: 404 },
      );
    }

    const calculation = calculateStockTrade(input, marketStock.assetType);
    const result = await applyAndRecordStockTrade(
      userId,
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
        { error: "目前庫存中沒有此股票代號，無法賣出" },
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

    const [item] = result.document
      ? await serializeStockPositionsWithValuations([result.document])
      : [null];

    return NextResponse.json({
      item,
      transaction: serializeStockTransaction(result.transaction),
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      upsertedCount: result.upsertedCount,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof StockMarketServiceError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    if (error instanceof MongoServerError && error.code === 11000) {
      return NextResponse.json(
        { error: "庫存已被其他交易更新，請重新整理後再試" },
        { status: 409 },
      );
    }

    console.error("Failed to apply stock transaction", error);
    return NextResponse.json({ error: "股票交易失敗" }, { status: 500 });
  }
}
