import { NextResponse } from "next/server";

import { serializeUsStockPositionsWithValuations } from "@/lib/us-stock-position-view";
import {
  deleteUsStockPosition,
  parseUpdateUsStockPositionInput,
  parseUsStockPositionId,
  serializeUsStockPosition,
  updateUsStockPosition,
} from "@/models/UsStockPosition";

export const runtime = "nodejs";

type UsStockPositionRouteContext = {
  params: Promise<{ id: string }>;
};

function mutationError(status: "notFound" | "conflict") {
  if (status === "notFound") {
    return NextResponse.json({ error: "找不到此美股庫存" }, { status: 404 });
  }

  return NextResponse.json(
    { error: "資料已被其他操作更新，請重新整理後再試" },
    { status: 409 },
  );
}

export async function PATCH(
  request: Request,
  context: UsStockPositionRouteContext,
) {
  try {
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
    const objectId = parseUsStockPositionId(id);
    const input = parseUpdateUsStockPositionInput(body);
    const result = await updateUsStockPosition(objectId, input);

    if (result.status !== "success") {
      return mutationError(result.status);
    }

    const response = await serializeUsStockPositionsWithValuations([
      result.document,
    ]);

    return NextResponse.json({
      item: response.items[0],
      matchedCount: 1,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to update US stock position", error);
    return NextResponse.json({ error: "修改美股庫存失敗" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: UsStockPositionRouteContext,
) {
  try {
    const { id } = await context.params;
    const objectId = parseUsStockPositionId(id);
    const result = await deleteUsStockPosition(objectId);

    if (result.status !== "success") {
      return mutationError(result.status);
    }

    return NextResponse.json({
      item: serializeUsStockPosition(result.document),
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to delete US stock position", error);
    return NextResponse.json({ error: "刪除美股庫存失敗" }, { status: 500 });
  }
}
