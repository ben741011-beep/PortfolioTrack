import { MongoServerError } from "mongodb";
import { NextResponse } from "next/server";

import {
  familyMemberRequiredResponse,
  getAuthenticatedPortfolioContext,
  unauthorizedResponse,
} from "@/lib/auth-session";
import {
  findTaiwanStock,
  StockMarketServiceError,
} from "@/lib/taiwan-stock";
import { serializeStockPositionsWithValuations } from "@/lib/stock-position-view";
import {
  insertStockPosition,
  listStockPositions,
  parseCreateStockPositionInput,
  type StockPositionDocument,
} from "@/models/StockPosition";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const context = await getAuthenticatedPortfolioContext(request.headers);
    if (!context) return unauthorizedResponse();
    if (!context.familyMemberId) return familyMemberRequiredResponse();

    const documents = await listStockPositions(context.userId, context.familyMemberId);
    const items = await serializeStockPositionsWithValuations(documents);

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Failed to list stock positions", error);
    return NextResponse.json({ error: "讀取股票庫存失敗" }, { status: 500 });
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

    const input = parseCreateStockPositionInput(body);
    const stock = await findTaiwanStock(input.stockCode);

    if (!stock) {
      return NextResponse.json(
        { error: "找不到此上市或上櫃股票代號" },
        { status: 404 },
      );
    }

    const now = new Date();
    const document: StockPositionDocument = {
      userId: context.userId,
      familyMemberId: context.familyMemberId,
      stockCode: stock.stockCode,
      stockName: stock.stockName,
      assetType: stock.assetType,
      shares: input.shares,
      principal: input.principal,
      createdAt: now,
      updatedAt: now,
    };
    const inserted = await insertStockPosition(document);
    const [item] = await serializeStockPositionsWithValuations([inserted]);

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof TypeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof StockMarketServiceError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    if (error instanceof MongoServerError && error.code === 11000) {
      return NextResponse.json(
        { error: "此股票代號已存在於庫存中" },
        { status: 409 },
      );
    }

    console.error("Failed to create stock position", error);
    return NextResponse.json({ error: "新增股票庫存失敗" }, { status: 500 });
  }
}
