import { MongoServerError } from "mongodb";
import { NextResponse } from "next/server";

import {
  getAuthenticatedPortfolioContext,
  getAuthenticatedUserId,
  unauthorizedResponse,
} from "@/lib/auth-session";
import {
  insertFamilyMember,
  listFamilyMembers,
  parseFamilyMemberInput,
  serializeFamilyMember,
} from "@/models/FamilyMember";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const portfolioContext = await getAuthenticatedPortfolioContext(request.headers);
    if (!portfolioContext) return unauthorizedResponse();
    const members = await listFamilyMembers(portfolioContext.userId);
    return NextResponse.json({
      items: members.map(serializeFamilyMember),
      activeFamilyMemberId: portfolioContext.familyMemberId?.toHexString() ?? null,
    });
  } catch (error) {
    console.error("Failed to list family members", error);
    return NextResponse.json({ error: "讀取家庭成員失敗" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    if (!userId) return unauthorizedResponse();
    const input = parseFamilyMemberInput(await request.json());
    const member = await insertFamilyMember(userId, input);
    return NextResponse.json(serializeFamilyMember(member), { status: 201 });
  } catch (error) {
    if (error instanceof TypeError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof MongoServerError && error.code === 11000) {
      return NextResponse.json({ error: "本人資產檔案已存在" }, { status: 409 });
    }
    console.error("Failed to create family member", error);
    return NextResponse.json({ error: "新增家庭成員失敗" }, { status: 500 });
  }
}
