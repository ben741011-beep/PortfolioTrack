import { MongoServerError } from "mongodb";
import { NextResponse } from "next/server";

import {
  getAuthenticatedUserId,
  unauthorizedResponse,
} from "@/lib/auth-session";
import { findUsStockProfile, UsStockServiceError } from "@/lib/us-stock";
import { serializeUsStockPositionsWithValuations } from "@/lib/us-stock-position-view";
import {
  insertUsStockPosition,
  listUsStockPositions,
  parseCreateUsStockPositionInput,
  type UsStockPositionDocument,
} from "@/models/UsStockPosition";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    if (!userId) return unauthorizedResponse();

    const documents = await listUsStockPositions(userId);
    const response = await serializeUsStockPositionsWithValuations(documents);

    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to list US stock positions", error);
    return NextResponse.json({ error: "讀取美股庫存失敗" }, { status: 500 });
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

    const input = parseCreateUsStockPositionInput(body);
    const profile = await findUsStockProfile(input.stockCode);

    if (!profile) {
      return NextResponse.json(
        { error: "找不到此美股或 ETF 代號" },
        { status: 404 },
      );
    }

    const now = new Date();
    const document: UsStockPositionDocument = {
      userId,
      ...input,
      stockName: profile.stockName,
      assetType: profile.assetType,
      createdAt: now,
      updatedAt: now,
    };
    const inserted = await insertUsStockPosition(document);
    const response = await serializeUsStockPositionsWithValuations([inserted]);

    return NextResponse.json(
      { item: response.items[0], insertedCount: 1 },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof TypeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof UsStockServiceError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    if (error instanceof MongoServerError && error.code === 11000) {
      return NextResponse.json(
        { error: "此美股代號已存在於庫存中" },
        { status: 409 },
      );
    }

    console.error("Failed to create US stock position", error);
    return NextResponse.json({ error: "新增美股庫存失敗" }, { status: 500 });
  }
}
