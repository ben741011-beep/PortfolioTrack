import { type NextRequest, NextResponse } from "next/server";

import {
  findUsStockProfile,
  normalizeUsStockCode,
  UsStockServiceError,
} from "@/lib/us-stock";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const rawCode = request.nextUrl.searchParams.get("code");

  try {
    const stockCode = normalizeUsStockCode(rawCode);
    const profile = await findUsStockProfile(stockCode);

    if (!profile) {
      return NextResponse.json(
        { error: "找不到此美股或 ETF 代號" },
        { status: 404 },
      );
    }

    return NextResponse.json(profile);
  } catch (error) {
    if (error instanceof TypeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof UsStockServiceError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    console.error("US stock profile lookup failed", error);
    return NextResponse.json({ error: "美股資料查詢失敗" }, { status: 500 });
  }
}
