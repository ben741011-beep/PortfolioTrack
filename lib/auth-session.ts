import "server-only";

import { auth } from "@/models/Auth";
import {
  findFamilyMember,
  listFamilyMembers,
  parseFamilyMemberId,
} from "@/models/FamilyMember";

export const ACTIVE_FAMILY_MEMBER_COOKIE = "portfolio_family_member";

export async function getAuthenticatedUserId(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  return session?.user.id ?? null;
}

function readCookie(headers: Headers, name: string) {
  const cookieHeader = headers.get("cookie") ?? "";
  const prefix = `${name}=`;
  const value = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  return value ? decodeURIComponent(value) : null;
}

export async function getAuthenticatedPortfolioContext(headers: Headers) {
  const userId = await getAuthenticatedUserId(headers);
  if (!userId) return null;

  const selectedId = readCookie(headers, ACTIVE_FAMILY_MEMBER_COOKIE);
  if (selectedId) {
    try {
      const familyMemberId = parseFamilyMemberId(selectedId);
      const member = await findFamilyMember(userId, familyMemberId);
      if (member) return { userId, familyMemberId, member };
    } catch {
      // Ignore a stale or malformed selection and fall back to the first member.
    }
  }

  const [member] = await listFamilyMembers(userId);
  return member ? { userId, familyMemberId: member._id, member } : { userId };
}

export function unauthorizedResponse() {
  return Response.json({ error: "請先登入" }, { status: 401 });
}

export function familyMemberRequiredResponse() {
  return Response.json({ error: "請先建立家庭成員" }, { status: 409 });
}
