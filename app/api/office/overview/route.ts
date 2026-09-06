import { getOfficeOverview } from "@/lib/office-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await getOfficeOverview(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("AI Office overview error", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load AI Office." }, { status: 500 });
  }
}
