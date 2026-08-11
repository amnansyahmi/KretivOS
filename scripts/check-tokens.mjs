#!/usr/bin/env node
/**
 * Fails when a colour is hardcoded instead of going through a design token.
 *
 * The palette drifted to 78 near-identical chrome colours — nineteen creams,
 * thirteen greens for one weight of body text — because nothing stopped a new
 * screen from eyeballing its own value. Collapsing them was a one-off fix; this
 * is what keeps them collapsed. Without it the count is back in the dozens
 * within a few months and the app looks subtly unfinished again.
 *
 * Run: node scripts/check-tokens.mjs
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCANNED = ["app", "components"];

/**
 * Colour literals are legitimate in exactly three situations, and each one is
 * listed here so an exception has to be argued for rather than assumed.
 */
const ALLOWED = [
  {
    // Ink on paper. The letterhead prints in Kretivco's brand magenta and amber
    // whatever the app is themed as, and must never follow dark mode.
    file: "components/document-composer.tsx",
    fromLine: 96, toLine: 141,
    why: "exportCss — printed letterhead artwork",
  },
  {
    file: "components/print-document.tsx",
    why: "print stylesheet — paper, not app chrome",
  },
  {
    file: "app/print/[id]/page.tsx",
    why: "print route — paper, not app chrome",
  },
  {
    // A payslip preview reproduces the printed payslip, brand rules included.
    file: "components/hr-payslip-setup.tsx",
    why: "payslip preview reproduces the printed document",
  },
  {
    // themeColor is a browser API and cannot take a CSS variable.
    file: "app/layout.tsx",
    why: "viewport themeColor must be a literal",
  },
  {
    // The employee app sets its own status-bar colour, same browser API.
    file: "app/hr/app/page.tsx",
    why: "viewport themeColor must be a literal",
  },
  {
    // A placeholder showing the operator what a brand colour looks like. This
    // is content about colour, not the app's own colour.
    file: "app/brands/page.tsx",
    why: "placeholder text illustrating a client's brand palette",
  },
];

const isAllowed = (rel, line) =>
  ALLOWED.some((a) =>
    a.file === rel &&
    (a.fromLine === undefined || (line >= a.fromLine && line <= a.toLine)));

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next") walk(p, out);
    } else if (p.endsWith(".tsx") || p.endsWith(".ts")) out.push(p);
  }
  return out;
}

const RULES = [
  {
    // bg-[#f7f4ed] and friends.
    re: /\b[a-z-]+-\[#[0-9a-fA-F]{3,8}\](?:\/[0-9.]+)?/g,
    message: "hardcoded colour class — use a token (bg-background, text-foreground, text-accent…)",
  },
  {
    // Opaque bg-white. The translucent forms (bg-white/80) are real glass over
    // varied grounds and stay, so the negative lookahead matters.
    re: /\bbg-white\b(?!\/)/g,
    message: "opaque bg-white — raised surfaces use bg-card",
  },
  {
    // Raw hex in style objects, template CSS and string literals.
    re: /#[0-9a-fA-F]{6}\b(?![0-9a-fA-F])/g,
    message: "raw hex literal — use hsl(var(--token))",
    skipIfClassMatch: true,
  },
];

const failures = [];

for (const dir of SCANNED) {
  for (const file of walk(path.join(ROOT, dir))) {
    const rel = path.relative(ROOT, file);
    const lines = fs.readFileSync(file, "utf8").split("\n");

    lines.forEach((line, i) => {
      const lineNo = i + 1;
      if (isAllowed(rel, lineNo)) return;

      for (const rule of RULES) {
        rule.re.lastIndex = 0;
        let m;
        while ((m = rule.re.exec(line)) !== null) {
          // A raw-hex hit inside `bg-[#...]` is already reported by rule one.
          if (rule.skipIfClassMatch && /-\[#[0-9a-fA-F]{3,8}\]/.test(line)) continue;
          failures.push({ rel, lineNo, found: m[0], message: rule.message });
        }
      }
    });
  }
}

if (!failures.length) {
  console.log("✓ no hardcoded colours outside the allowed list");
  process.exit(0);
}

console.error(`✗ ${failures.length} hardcoded colour${failures.length === 1 ? "" : "s"}:\n`);
for (const f of failures) {
  console.error(`  ${f.rel}:${f.lineNo}  ${f.found}`);
  console.error(`    ${f.message}`);
}
console.error(
  `\nIf a literal is genuinely correct — printed artwork, a browser API that ` +
  `cannot take a variable, or content that is itself about colour — add it to ` +
  `ALLOWED in scripts/check-tokens.mjs with the reason.`,
);
process.exit(1);
