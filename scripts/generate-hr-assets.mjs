/**
 * Derives every KretivHR image asset from the one source logo.
 *
 * `public/kretiv-hr-logo.png` is the brand artwork as supplied: a transparent
 * 1536x1024 canvas with the mark and wordmark sitting in the middle of it. Every
 * icon and splash screen the app needs is a crop and a resize of that, so they
 * are generated rather than committed by hand — a re-cut logo means re-running
 * this, not opening an image editor and hoping the padding matches.
 *
 *   node scripts/generate-hr-assets.mjs
 *
 * The outputs are committed, because a build must not depend on this running.
 *
 * Two facts about the source drive the numbers below. The artwork occupies
 * x 126-1412, y 338-642 of the canvas; everything outside that is empty. And a
 * 21px column gap at x 439 separates the "iK" mark from the "KretivHR"
 * wordmark, which is what lets the mark be lifted out on its own.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SOURCE = "public/kretiv-hr-logo.png";

/** Measured bounds of the inked area, alpha > 8. */
const ART = { left: 126, top: 338, width: 1287, height: 305 };
/** The "iK" mark alone, up to the gap before the wordmark. */
const MARK = { left: 126, top: 338, width: 313, height: 305 };

/**
 * The ground an icon sits on.
 *
 * The mark is a blue-to-violet gradient drawn for a dark background — on the
 * app's cream it would be a bright shape on a bright field. This is the app's
 * own header colour rather than the brand's presentation black, so the
 * installed icon reads as this app rather than as a stray brand asset.
 */
const ICON_GROUND = { r: 32, g: 44, b: 37, alpha: 1 };
/** The app's background, which is what a splash screen has to match. */
const SPLASH_GROUND = { r: 247, g: 244, b: 237, alpha: 1 };

/**
 * How much of an icon the mark fills.
 *
 * `any` is the icon shown as drawn, so the mark can be generous. `maskable`
 * gets cropped to whatever shape the platform likes — Android's worst case is a
 * circle inscribed in the tile — so its content has to stay inside the middle
 * 80%, and a mark sized for `any` would lose its corners.
 */
const FILL = { any: 0.72, maskable: 0.54 };

async function markOn({ size, ground, fill, out }) {
  const target = Math.round(size * fill);
  const mark = await sharp(SOURCE)
    .extract(MARK)
    .resize({ width: target, height: target, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  const { width, height } = await sharp(mark).metadata();

  await sharp({ create: { width: size, height: size, channels: 4, background: ground } })
    .composite([{ input: mark, left: Math.round((size - width) / 2), top: Math.round((size - height) / 2) }])
    .png()
    .toFile(out);
  return out;
}

/**
 * Portrait splash screens, one per device resolution.
 *
 * iOS matches these on exact CSS dimensions and pixel ratio and shows a blank
 * white screen when nothing matches, so the list is the coverage: a device
 * absent here gets no splash rather than a stretched one. Point sizes are what
 * the media query compares, and the pixel size is what the file has to be.
 */
const SPLASH_DEVICES = [
  { points: [320, 568], ratio: 2, name: "iPhone SE (1st gen), 5s" },
  { points: [375, 667], ratio: 2, name: "iPhone SE (2nd/3rd gen), 8" },
  { points: [414, 736], ratio: 3, name: "iPhone 8 Plus" },
  { points: [375, 812], ratio: 3, name: "iPhone X, XS, 11 Pro, 12 mini, 13 mini" },
  { points: [414, 896], ratio: 2, name: "iPhone XR, 11" },
  { points: [414, 896], ratio: 3, name: "iPhone XS Max, 11 Pro Max" },
  { points: [390, 844], ratio: 3, name: "iPhone 12, 13, 14" },
  { points: [428, 926], ratio: 3, name: "iPhone 12/13/14 Pro Max" },
  { points: [393, 852], ratio: 3, name: "iPhone 14 Pro, 15, 16" },
  { points: [430, 932], ratio: 3, name: "iPhone 14 Pro Max, 15 Pro Max, 16 Plus" },
  { points: [402, 874], ratio: 3, name: "iPhone 16 Pro" },
  { points: [440, 956], ratio: 3, name: "iPhone 16 Pro Max" },
  { points: [768, 1024], ratio: 2, name: "iPad, iPad mini" },
  { points: [820, 1180], ratio: 2, name: "iPad Air" },
  { points: [1024, 1366], ratio: 2, name: 'iPad Pro 12.9"' },
];

async function splash({ points, ratio }) {
  const [pointWidth, pointHeight] = points;
  const width = pointWidth * ratio;
  const height = pointHeight * ratio;

  // The wordmark at a little over half the screen width, optically centred —
  // sat slightly high, because dead centre reads as low once the eye accounts
  // for the notch.
  const target = Math.round(width * 0.56);
  const art = await sharp(SOURCE).extract(ART).resize({ width: target }).toBuffer();
  const { width: artWidth, height: artHeight } = await sharp(art).metadata();

  const out = `public/splash/hr-splash-${width}x${height}.png`;
  await sharp({ create: { width, height, channels: 4, background: SPLASH_GROUND } })
    .composite([{ input: art, left: Math.round((width - artWidth) / 2), top: Math.round(height * 0.44 - artHeight / 2) }])
    .png({ compressionLevel: 9, palette: true })
    .toFile(out);
  return { out, width, height, points, ratio };
}

await mkdir("public/icons", { recursive: true });
await mkdir("public/splash", { recursive: true });

const icons = [
  await markOn({ size: 192, ground: ICON_GROUND, fill: FILL.any, out: "public/icons/hr-icon-192.png" }),
  await markOn({ size: 512, ground: ICON_GROUND, fill: FILL.any, out: "public/icons/hr-icon-512.png" }),
  await markOn({ size: 512, ground: ICON_GROUND, fill: FILL.maskable, out: "public/icons/hr-icon-maskable-512.png" }),
  // iOS applies its own rounded mask to this one and never a circular crop, so
  // it takes the generous fill rather than the maskable padding.
  await markOn({ size: 180, ground: ICON_GROUND, fill: FILL.any, out: "public/icons/hr-apple-touch-180.png" }),
];

// The mark and the wordmark as flat assets, for use in the pages themselves.
await sharp(SOURCE).extract(MARK).resize({ width: 256 }).png().toFile("public/icons/hr-mark.png");
await sharp(SOURCE).extract(ART).resize({ width: 1024 }).png().toFile("public/icons/hr-wordmark.png");

const splashes = [];
for (const device of SPLASH_DEVICES) splashes.push(await splash(device));

/*
 * The media queries, written out rather than hand-maintained: fifteen of them
 * transcribed by hand is fifteen chances to mistype a pixel ratio, and a
 * mistyped one shows up as a white launch screen on exactly one device model
 * that nobody testing happens to own.
 */
const entries = splashes.map(({ out, points, ratio, }) => {
  const url = `/${path.relative("public", out).split(path.sep).join("/")}`;
  const media = `(device-width: ${points[0]}px) and (device-height: ${points[1]}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`;
  return `  { url: "${url}", media: "${media}" },`;
}).join("\n");

const header = [
  "/**",
  " * Launch screens for the installed app, one per device resolution.",
  " *",
  " * Generated by `scripts/generate-hr-assets.mjs` — do not edit by hand; edit",
  " * the device list in that script and re-run it.",
  " *",
  " * iOS matches these on exact CSS dimensions and pixel ratio, and shows a blank",
  " * white screen when nothing matches, so this list is the coverage: a device not",
  " * named here simply gets no launch screen. Portrait only, because the app is",
  " * locked to portrait in the manifest.",
  " */",
  "",
  "export const HR_STARTUP_IMAGES = [",
  entries,
  "];",
  "",
].join("\n");

await writeFile("app/hr/app/startup-images.ts", header);

console.log(`icons:    ${icons.length}`);
console.log(`splashes: ${splashes.length}`);
console.log(`metadata: app/hr/app/startup-images.ts`);
