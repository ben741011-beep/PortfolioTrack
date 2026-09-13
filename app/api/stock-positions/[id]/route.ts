import { NextResponse } from "next/server";

import {
  getAuthenticatedUserId,
  unauthorizedResponse,
} from "@/lib/auth-session";
import { serializeStockPositionsWithValuations } from "@/lib/stock-position-view";
import {
  deleteStockPosition,
  parseStockPositionId,
  parseUpdateStockPositionInput,
  serializeStockPosition,
  updateStockPosition,
} from "@/models/StockPosition";

export const runtime = "nodejs";

type StockPositionRouteContext = {
  params: Promise<{ id: string }>;
};

function mutationError(status: "notFound" | "conflict") {
  if (status === "notFound") {
    return NextResponse.json({ error: "找不到此股票庫存" }, { status: 404 });
  }

  return NextResponse.json(
    { error: "資料已被其他操作更新，請重新整理後再試" },
    { status: 409 },
  );
}

export async function PATCH(
  request: Request,
  context: StockPositionRouteContext,
) {
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

    const { id } = await context.params;
    const objectId = parseStockPositionId(id);
    const input = parseUpdateStockPositionInput(body);
    const result = await updateStockPosition(userId, objectId, input);

    if (result.status !== "success") {
      return mutationError(result.status);
    }

    const [item] = await serializeStockPositionsWithValuations([
      result.document,
    ]);

    return NextResponse.json({
      item,
      matchedCount: 1,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to update stock position", error);
    return NextResponse.json({ error: "修改股票庫存失敗" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: StockPositionRouteContext,
) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    if (!userId) return unauthorizedResponse();

    const { id } = await context.params;
    const objectId = parseStockPositionId(id);
    const result = await deleteStockPosition(userId, objectId);

    if (result.status !== "success") {
      return mutationError(result.status);
    }

    return NextResponse.json({
      item: serializeStockPosition(result.document),
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to delete stock position", error);
    return NextResponse.json({ error: "刪除股票庫存失敗" }, { status: 500 });
  }
}
