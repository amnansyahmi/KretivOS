import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const clean = (value: unknown) => String(value ?? "").trim();
const optional = (value: unknown) => clean(value) || null;
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const array = (value: unknown) => Array.isArray(value) ? value.map((item) => typeof item === "string" ? item.trim() : item).filter(Boolean) : [];

function completeness(data: any) {
  const checks = [
    clean(data.positioning), clean(data.audience), clean(data.personality), clean(data.voice),
    clean(data.photographyDirection), array(data.colours).length, Object.keys(object(data.typography)).length,
    Object.keys(object(data.messaging)).length, array(data.approvedClaims).length,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function mapProfile(row: any) {
  return {
    id: row.id,
    brandId: row.brand_id,
    status: row.status,
    positioning: row.positioning ?? "",
    audience: row.audience ?? "",
    personality: row.personality ?? "",
    voice: row.voice ?? "",
    messaging: row.messaging ?? {},
    colours: Array.isArray(row.colours) ? row.colours : [],
    typography: row.typography ?? {},
    photographyDirection: row.photography_direction ?? "",
    approvedClaims: Array.isArray(row.approved_claims) ? row.approved_claims : [],
    avoidList: Array.isArray(row.avoid_list) ? row.avoid_list : [],
    evidence: Array.isArray(row.evidence) ? row.evidence : [],
    aiSuggestions: Array.isArray(row.ai_suggestions) ? row.ai_suggestions : [],
    completenessScore: Number(row.completeness_score),
    approvedAt: row.approved_at ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function verifyBrand(brandId: string) {
  const sql = getDatabase();
  const rows = await sql`
    select b.id, b.name, b.customer_id, c.name as customer_name
    from brands b
    join customers c on c.id = b.customer_id
    where b.id = ${brandId} and c.organization_id = ${ORGANIZATION_ID}
  `;
  if (!rows.length) throw new Error("Brand was not found.");
  return rows[0];
}

async function audit(action: string, entityId: string | null, afterData?: unknown) {
  try {
    const sql = getDatabase();
    await sql`
      insert into audit_logs (organization_id, action, entity_type, entity_id, after_data, metadata)
      values (
        ${ORGANIZATION_ID}, ${action}, 'brand_dna_profile', ${entityId},
        ${afterData ? JSON.stringify(afterData) : null}::jsonb,
        ${JSON.stringify({ source: "brand-dna-api", authentication: "skipped" })}::jsonb
      )
    `;
  } catch {}
}

async function listData() {
  const sql = getDatabase();
  const [brandRows, profileRows] = await Promise.all([
    sql`
      select b.*, c.name as customer_name
      from brands b
      join customers c on c.id = b.customer_id
      where c.organization_id = ${ORGANIZATION_ID}
      order by c.name, b.name
    `,
    sql`
      select p.* from brand_dna_profiles p
      join brands b on b.id = p.brand_id
      join customers c on c.id = b.customer_id
      where c.organization_id = ${ORGANIZATION_ID}
      order by p.updated_at desc
    `,
  ]);

  return {
    brands: brandRows.map((brand: any) => ({
      id: brand.id,
      customerId: brand.customer_id,
      customerName: brand.customer_name,
      name: brand.name,
      description: brand.description ?? "",
      status: brand.status,
      websiteUrl: brand.website_url ?? "",
      profiles: profileRows.filter((profile: any) => profile.brand_id === brand.id).map(mapProfile),
    })),
    syncedAt: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    return NextResponse.json(await listData(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load Brand DNA." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const brandId = clean(body.brandId);
    if (!brandId) return NextResponse.json({ error: "Brand is required." }, { status: 400 });
    await verifyBrand(brandId);
    const id = clean(body.id) || randomUUID();
    const score = completeness(body);
    const sql = getDatabase();
    const rows = await sql`
      insert into brand_dna_profiles (
        id, brand_id, status, positioning, audience, personality, voice,
        messaging, colours, typography, photography_direction,
        approved_claims, avoid_list, evidence, ai_suggestions,
        completeness_score, approved_at
      ) values (
        ${id}, ${brandId}, ${clean(body.status) || "Draft"}, ${optional(body.positioning)},
        ${optional(body.audience)}, ${optional(body.personality)}, ${optional(body.voice)},
        ${JSON.stringify(object(body.messaging))}::jsonb, ${JSON.stringify(array(body.colours))}::jsonb,
        ${JSON.stringify(object(body.typography))}::jsonb, ${optional(body.photographyDirection)},
        ${JSON.stringify(array(body.approvedClaims))}::jsonb, ${JSON.stringify(array(body.avoidList))}::jsonb,
        ${JSON.stringify(array(body.evidence))}::jsonb, ${JSON.stringify(array(body.aiSuggestions))}::jsonb,
        ${score}, ${clean(body.status) === "Approved" ? new Date().toISOString() : null}
      ) returning *
    `;
    const profile = mapProfile(rows[0]);
    await audit("create", id, profile);
    return NextResponse.json({ profile }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create Brand DNA." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const id = clean(body.id);
    const brandId = clean(body.brandId);
    if (!id || !brandId) return NextResponse.json({ error: "Profile ID and brand are required." }, { status: 400 });
    await verifyBrand(brandId);
    const score = completeness(body);
    const status = clean(body.status) || "Draft";
    const sql = getDatabase();
    const rows = await sql`
      update brand_dna_profiles set
        brand_id = ${brandId}, status = ${status}, positioning = ${optional(body.positioning)},
        audience = ${optional(body.audience)}, personality = ${optional(body.personality)},
        voice = ${optional(body.voice)}, messaging = ${JSON.stringify(object(body.messaging))}::jsonb,
        colours = ${JSON.stringify(array(body.colours))}::jsonb,
        typography = ${JSON.stringify(object(body.typography))}::jsonb,
        photography_direction = ${optional(body.photographyDirection)},
        approved_claims = ${JSON.stringify(array(body.approvedClaims))}::jsonb,
        avoid_list = ${JSON.stringify(array(body.avoidList))}::jsonb,
        evidence = ${JSON.stringify(array(body.evidence))}::jsonb,
        ai_suggestions = ${JSON.stringify(array(body.aiSuggestions))}::jsonb,
        completeness_score = ${score},
        approved_at = case when ${status} = 'Approved' then coalesce(approved_at, now()) else null end
      where id = ${id}
        and brand_id in (
          select b.id from brands b join customers c on c.id = b.customer_id
          where c.organization_id = ${ORGANIZATION_ID}
        )
      returning *
    `;
    if (!rows.length) return NextResponse.json({ error: "Brand DNA profile was not found." }, { status: 404 });
    const profile = mapProfile(rows[0]);
    await audit(status === "Approved" ? "approve" : "update", id, profile);
    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update Brand DNA." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = clean(new URL(request.url).searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "Profile ID is required." }, { status: 400 });
    const sql = getDatabase();
    const rows = await sql`
      delete from brand_dna_profiles
      where id = ${id}
        and brand_id in (
          select b.id from brands b join customers c on c.id = b.customer_id
          where c.organization_id = ${ORGANIZATION_ID}
        )
      returning id
    `;
    if (!rows.length) return NextResponse.json({ error: "Brand DNA profile was not found." }, { status: 404 });
    await audit("delete", id);
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete Brand DNA." }, { status: 500 });
  }
}
