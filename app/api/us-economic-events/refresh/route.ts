import { NextResponse } from "next/server";

import { fetchOfficialUsEconomicEvents } from "@/lib/us-economic-event-sources";
import {
  getAuthenticatedUserId,
  unauthorizedResponse,
} from "@/lib/auth-session";
import {
  countUsEconomicEvents,
  planUsEconomicEventUpserts,
  upsertUsEconomicEvents,
} from "@/models/UsEconomicEvent";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    if (!userId) return unauthorizedResponse();

    const beforeCount = await countUsEconomicEvents();
    const events = await fetchOfficialUsEconomicEvents();
    const plan = await planUsEconomicEventUpserts(events);
    const result = await upsertUsEconomicEvents(events);
    const afterCount = await countUsEconomicEvents();

    if (
      result.insertedCount !== plan.insertKeys.length ||
      result.modifiedCount !== plan.updateKeys.length ||
      result.skippedCount !== plan.skipKeys.length
    ) {
      throw new Error("經濟時程實際寫入結果與 preflight 不一致");
    }

    return NextResponse.json({
      beforeCount,
      requestedCount: result.requestedCount,
      insertedCount: result.insertedCount,
      modifiedCount: result.modifiedCount,
      skippedCount: result.skippedCount,
      verifiedCount: result.verifiedCount,
      afterCount,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to refresh US economic events", error);
    return NextResponse.json(
      { error: "更新美國經濟時程失敗，既有資料未刪除" },
      { status: 502 },
    );
  }
}
