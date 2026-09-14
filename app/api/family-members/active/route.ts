import { NextResponse } from "next/server";

import {
  ACTIVE_FAMILY_MEMBER_COOKIE,
  getAuthenticatedUserId,
  unauthorizedResponse,
} from "@/lib/auth-session";
import { findFamilyMember, parseFamilyMemberId } from "@/models/FamilyMember";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    if (!userId) return unauthorizedResponse();
    const body = (await request.json()) as { familyMemberId?: unknown };
    const familyMemberId = parseFamilyMemberId(body.familyMemberId);
    const member = await findFamilyMember(userId, familyMemberId);
    if (!member) {
      return NextResponse.json({ error: "找不到家庭成員" }, { status: 404 });
    }

    const response = NextResponse.json({ activeFamilyMemberId: familyMemberId.toHexString() });
    response.cookies.set(ACTIVE_FAMILY_MEMBER_COOKIE, familyMemberId.toHexString(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch (error) {
    if (error instanceof TypeError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Failed to select family member", error);
    return NextResponse.json({ error: "切換家庭成員失敗" }, { status: 500 });
  }
}
