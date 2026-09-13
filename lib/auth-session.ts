import "server-only";

import { auth } from "@/models/Auth";

export async function getAuthenticatedUserId(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  return session?.user.id ?? null;
}

export function unauthorizedResponse() {
  return Response.json({ error: "請先登入" }, { status: 401 });
}
