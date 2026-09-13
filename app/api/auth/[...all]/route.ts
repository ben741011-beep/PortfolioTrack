import { assertAuthCollectionsReady } from "@/models/AuthCollections";
import { auth } from "@/models/Auth";

export const runtime = "nodejs";

async function withPreparedAuth(request: Request) {
  try {
    await assertAuthCollectionsReady();
  } catch (error) {
    console.error("Auth collections are not ready", error);
    return Response.json(
      { error: "登入系統尚未完成初始化" },
      { status: 503 },
    );
  }

  return auth.handler(request);
}

export const GET = withPreparedAuth;
export const POST = withPreparedAuth;
