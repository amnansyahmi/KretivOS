import assert from "node:assert/strict";
import test from "node:test";
import { brandDirectives, brandOfflineNote, describeBrandDna, type BrandDnaResult } from "./brand-dna.ts";

function fixture(overrides: Partial<BrandDnaResult["profile"]> = {}, reviewed = true): BrandDnaResult {
  return {
    brand: { id: "brand-kek", name: "Kedai Kek Ratu", customerId: "customer-1", customerName: "Chef Ammar", description: "", websiteUrl: "" },
    profile: {
      status: reviewed ? "Approved" : "Draft",
      reviewed,
      completenessScore: 88,
      positioning: "Kek harian yang jujur",
      audience: "Keluarga muda di Shah Alam",
      personality: "Hangat, mesra",
      voice: "Santai, Bahasa Melayu campur English",
      messaging: {},
      colours: ["#EF7F5F"],
      typography: {},
      photographyDirection: "Cahaya siang lembut, tekstur sebenar",
      approvedClaims: ["Dibakar setiap pagi"],
      avoidList: ["Jangan guna perkataan mewah"],
      approvedAt: "",
      updatedAt: "",
      ...overrides,
    },
  };
}

test("directives state the brand's facts and require the model to match them", () => {
  const lines = brandDirectives(fixture()).join(" ");
  assert.match(lines, /Kedai Kek Ratu \(Chef Ammar\), status approved/);
  assert.match(lines, /positioning "Kek harian yang jujur"/);
  assert.match(lines, /photography direction "Cahaya siang lembut, tekstur sebenar"/);
  assert.match(lines, /Match this Brand DNA/);
});

test("an unreviewed profile is still used, but flagged as provisional", () => {
  const lines = brandDirectives(fixture({}, false)).join(" ");
  assert.match(lines, /status draft, not yet approved — tell the operator/);
});

test("approved claims are stated as the only claims allowed", () => {
  const lines = brandDirectives(fixture()).join(" ");
  assert.match(lines, /Only these claims are approved.*Dibakar setiap pagi/);
  assert.match(lines, /Do not state any other factual claim/);
});

test("no approved claims means no claims are allowed, not silence on the topic", () => {
  const lines = brandDirectives(fixture({ approvedClaims: [] })).join(" ");
  assert.match(lines, /No factual claims are approved for this brand yet/);
});

test("the avoid list is carried into the directives, and omitted line-item when empty", () => {
  const withAvoid = brandDirectives(fixture()).join(" ");
  assert.match(withAvoid, /avoid list — never use this language or imagery.*Jangan guna perkataan mewah/);

  const withoutAvoid = brandDirectives(fixture({ avoidList: [] }));
  assert.ok(withoutAvoid.every((line) => !line.includes("avoid list")), "an empty avoid list adds no empty instruction");
});

test("a brand with nothing recorded yet still produces a usable, honest directive", () => {
  const empty = fixture({ positioning: "", personality: "", voice: "", photographyDirection: "", approvedClaims: [], avoidList: [] });
  const lines = brandDirectives(empty).join(" ");
  assert.match(lines, /no positioning, personality, voice or photography direction recorded yet/);
});

test("the offline note prefers photography direction, then positioning, then voice", () => {
  assert.equal(brandOfflineNote(fixture()), "Brand direction for Kedai Kek Ratu: Cahaya siang lembut, tekstur sebenar.");
  assert.equal(
    brandOfflineNote(fixture({ photographyDirection: "" })),
    "Brand direction for Kedai Kek Ratu: Kek harian yang jujur.",
  );
  assert.equal(
    brandOfflineNote(fixture({ photographyDirection: "", positioning: "" })),
    "Brand direction for Kedai Kek Ratu: Santai, Bahasa Melayu campur English.",
  );
  assert.equal(
    brandOfflineNote(fixture({ photographyDirection: "", positioning: "", voice: "" })),
    "Match Kedai Kek Ratu's established brand identity.",
  );
});

test("describeBrandDna distinguishes approved, draft and not-found for the operator", () => {
  assert.equal(describeBrandDna({ found: true, result: fixture() }), "Grounded in Kedai Kek Ratu's approved Brand DNA.");
  assert.match(
    describeBrandDna({ found: true, result: fixture({}, false) }),
    /still a draft — treat this generation as provisional/,
  );
  assert.equal(
    describeBrandDna({ found: false, label: "Kek Ratu" }),
    'No Brand DNA found yet for "Kek Ratu". Add one in Brand DNA for stronger, on-brand generations.',
  );
});
