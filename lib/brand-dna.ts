/**
 * Reads a customer's approved Brand DNA so AI generation can be grounded in it
 * instead of guessing a visual identity from a name alone.
 *
 * This is the one place the lookup happens. `app/api/prompt/generate/route.ts`
 * uses it to fold positioning, tone and photography direction into every
 * generated prompt, and `lib/mcp/tools.ts`'s `get_brand_dna` tool uses the same
 * function so an external assistant and KretivOS's own Prompt Lab can never
 * disagree about what a brand's Brand DNA actually says.
 */

// Relative, not "@/lib/db": this file is unit-tested directly by the plain
// node --test runner, which has no bundler to resolve the "@/" path alias.
import { getDatabase } from "./db.ts";

const ORGANIZATION_ID = "org-kretivco";

export type BrandDnaRecord = {
  id: string;
  name: string;
  customerId: string;
  customerName: string;
  description: string;
  websiteUrl: string;
};

export type BrandDnaProfile = {
  status: string;
  /** True once a human has approved this profile. A draft is still shown, never hidden, but flagged. */
  reviewed: boolean;
  completenessScore: number;
  positioning: string;
  audience: string;
  personality: string;
  voice: string;
  messaging: Record<string, unknown>;
  colours: string[];
  typography: Record<string, unknown>;
  photographyDirection: string;
  approvedClaims: string[];
  avoidList: string[];
  approvedAt: string;
  updatedAt: string;
};

export type BrandDnaResult = { brand: BrandDnaRecord; profile: BrandDnaProfile };

/**
 * Resolves a brand by id or by name (brand name or its customer's name), and
 * returns its most relevant profile — the approved one when there is one,
 * otherwise the newest draft. Returns null when the brand or its profile
 * cannot be found; a database outage propagates as a thrown error, since the
 * caller decides whether that should block generation or just go without.
 */
export async function findBrandDna(
  sql: ReturnType<typeof getDatabase>,
  idOrName: string,
): Promise<BrandDnaResult | null> {
  const asked = idOrName.trim();
  if (!asked) return null;
  const pattern = `%${asked}%`;

  const brands = await sql`
    select b.*, c.name as customer_name
    from brands b join customers c on c.id = b.customer_id
    where c.organization_id = ${ORGANIZATION_ID}
      and (b.id = ${asked} or b.name ilike ${asked} or b.name ilike ${pattern} or c.name ilike ${pattern})
    order by (b.id = ${asked}) desc, (b.name ilike ${asked}) desc, b.name
    limit 1
  `;
  const brand = brands[0] as any;
  if (!brand) return null;

  // Approved wins over a newer draft: only a human-reviewed profile should
  // speak for the client by default.
  const profiles = await sql`
    select * from brand_dna_profiles
    where brand_id = ${brand.id}
    order by (status = 'Approved') desc, updated_at desc
    limit 1
  `;
  const profile = profiles[0] as any;
  if (!profile) return null;

  return {
    brand: {
      id: brand.id,
      name: brand.name,
      customerId: brand.customer_id,
      customerName: brand.customer_name,
      description: brand.description ?? "",
      websiteUrl: brand.website_url ?? "",
    },
    profile: {
      status: profile.status,
      reviewed: profile.status === "Approved",
      completenessScore: Number(profile.completeness_score || 0),
      positioning: profile.positioning ?? "",
      audience: profile.audience ?? "",
      personality: profile.personality ?? "",
      voice: profile.voice ?? "",
      messaging: profile.messaging ?? {},
      colours: Array.isArray(profile.colours) ? profile.colours : [],
      typography: profile.typography ?? {},
      photographyDirection: profile.photography_direction ?? "",
      approvedClaims: Array.isArray(profile.approved_claims) ? profile.approved_claims : [],
      avoidList: Array.isArray(profile.avoid_list) ? profile.avoid_list : [],
      approvedAt: profile.approved_at ?? "",
      updatedAt: profile.updated_at,
    },
  };
}

/**
 * System-prompt lines that hold a generation to a brand's Brand DNA.
 *
 * Pure and DB-free so it can be unit tested directly: given a result, this is
 * the only place that decides how positioning, voice, approved claims and the
 * avoid list turn into instructions the model actually reads.
 */
export function brandDirectives(result: BrandDnaResult): string[] {
  const { brand, profile } = result;
  const facts = [
    profile.positioning && `positioning "${profile.positioning}"`,
    profile.personality && `personality "${profile.personality}"`,
    profile.voice && `voice "${profile.voice}"`,
    profile.photographyDirection && `photography direction "${profile.photographyDirection}"`,
  ].filter(Boolean);

  return [
    `Brand DNA for ${brand.name} (${brand.customerName}), status ${profile.reviewed ? "approved" : "draft, not yet approved — tell the operator this generation is provisional"}: ${facts.length ? facts.join("; ") : "no positioning, personality, voice or photography direction recorded yet"}.`,
    "Match this Brand DNA: its positioning, personality, voice and photography direction. Do not invent a different visual identity for this brand.",
    profile.approvedClaims.length
      ? `Only these claims are approved for this brand and may appear if relevant: ${profile.approvedClaims.join("; ")}. Do not state any other factual claim about the brand or product.`
      : "No factual claims are approved for this brand yet; do not state any claim about it.",
    profile.avoidList.length
      ? `This brand's avoid list — never use this language or imagery, even where it would otherwise fit: ${profile.avoidList.join("; ")}.`
      : "",
  ].filter(Boolean);
}

/** One sentence describing the brand's direction, for the offline fallback prompt. */
export function brandOfflineNote(result: BrandDnaResult): string {
  const { brand, profile } = result;
  const direction = profile.photographyDirection || profile.positioning || profile.voice;
  return direction
    ? `Brand direction for ${brand.name}: ${direction}.`
    : `Match ${brand.name}'s established brand identity.`;
}

export type BrandDnaStatus = { found: true; result: BrandDnaResult } | { found: false; label: string };

/**
 * A short, user-facing account of what happened during lookup — grounded,
 * grounded-but-unreviewed, or nothing found for what was typed. Kept separate
 * from the directives above because a caller wants this even when there was
 * no match, to tell the operator why.
 */
export function describeBrandDna(status: BrandDnaStatus): string {
  if (!status.found) return `No Brand DNA found yet for "${status.label}". Add one in Brand DNA for stronger, on-brand generations.`;
  const { brand, profile } = status.result;
  return profile.reviewed
    ? `Grounded in ${brand.name}'s approved Brand DNA.`
    : `${brand.name}'s Brand DNA is still a draft — treat this generation as provisional until it is approved.`;
}
