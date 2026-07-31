import { NextRequest, NextResponse } from "next/server";
import {
  archiveReadNotifications,
  deleteAutomationRecipe,
  listAutomationData,
  markServerNotification,
  resolveAutomationApproval,
  runAutomationNow,
  runDailyAutomationScan,
  saveAutomationRecipe,
} from "@/lib/automation-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await listAutomationData(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load automations." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const operation = String(body.operation || "");
    if (operation === "save") return NextResponse.json({ recipe: await saveAutomationRecipe(body.recipe) });
    if (operation === "migrate") {
      const recipes = Array.isArray(body.recipes) ? body.recipes : [];
      for (const recipe of recipes) await saveAutomationRecipe(recipe);
      return NextResponse.json({ ok: true });
    }
    if (operation === "run") {
      await runAutomationNow(String(body.recipeId || ""));
      return NextResponse.json({ ok: true });
    }
    if (operation === "resolve") {
      await resolveAutomationApproval(String(body.approvalId || ""), body.decision === "Rejected" ? "Rejected" : "Approved");
      return NextResponse.json({ ok: true });
    }
    if (operation === "scan") {
      await runDailyAutomationScan();
      return NextResponse.json({ ok: true });
    }
    if (operation === "notification") {
      await markServerNotification(String(body.id || ""), Boolean(body.read));
      return NextResponse.json({ ok: true });
    }
    if (operation === "clear_read") {
      return NextResponse.json({ ok: true, archived: await archiveReadNotifications() });
    }
    return NextResponse.json({ error: "Unsupported automation operation." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Automation operation failed." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get("id") || "";
    await deleteAutomationRecipe(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete automation." }, { status: 400 });
  }
}
