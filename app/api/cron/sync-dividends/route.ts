import { NextResponse } from "next/server";

import { DividendSourceError } from "@/lib/dividend-sources";
import { syncDividendRecords } from "@/lib/dividend-sync";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const cronSecret = process.env.DIVIDEND_CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "未授權的同步請求" }, { status: 401 });
  }

  try {
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    const result = await syncDividendRecords({ dryRun });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DividendSourceError) {
      console.error("Failed to fetch dividend sources", error);
      return NextResponse.json(
        { error: "官方股息資料來源暫時無法使用" },
        { status: 502 },
      );
    }

    console.error("Failed to sync dividend records", error);
    return NextResponse.json({ error: "同步股息資料失敗" }, { status: 500 });
  }
}
