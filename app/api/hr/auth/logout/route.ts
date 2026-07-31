import { NextRequest, NextResponse } from "next/server";
import { deleteHRSession, HR_SESSION_COOKIE } from "@/lib/hr-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(HR_SESSION_COOKIE)?.value || "";
  await deleteHRSession(token).catch(() => undefined);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(HR_SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}
