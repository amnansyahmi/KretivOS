import { NextRequest } from "next/server";
import { getOfficeMission, listOfficeMissions } from "@/lib/office-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id")?.trim();
    if (id) {
      const item = await getOfficeMission(id);
      return item ? Response.json(item) : Response.json({ error: "Mission not found." }, { status: 404 });
    }
    const limit = Number(request.nextUrl.searchParams.get("limit") || 20);
    return Response.json({ missions: await listOfficeMissions(limit) });
  } catch (error) {
    console.error("AI Office history error", error);
    return Response.json({ error: "Unable to load AI Office history." }, { status: 500 });
  }
}
