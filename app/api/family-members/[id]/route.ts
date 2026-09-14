import { NextResponse } from "next/server";

import {
  getAuthenticatedUserId,
  unauthorizedResponse,
} from "@/lib/auth-session";
import {
  parseFamilyMemberId,
  parseFamilyMemberInput,
  serializeFamilyMember,
  updateFamilyMember,
} from "@/models/FamilyMember";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/family-members/[id]">,
) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    if (!userId) return unauthorizedResponse();
    const { id } = await context.params;
    const member = await updateFamilyMember(
      userId,
      parseFamilyMemberId(id),
      parseFamilyMemberInput(await request.json()),
    );
    if (!member) {
      return NextResponse.json({ error: "找不到家庭成員" }, { status: 404 });
    }
    return NextResponse.json(serializeFamilyMember(member));
  } catch (error) {
    if (error instanceof TypeError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Failed to update family member", error);
    return NextResponse.json({ error: "修改家庭成員失敗" }, { status: 500 });
  }
}
