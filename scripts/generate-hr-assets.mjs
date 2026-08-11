/**
 * Derives every KretivHR image asset from the one source logo.
 *
 * `public/kretiv-hr-logo.png` is the brand artwork as supplied. Every icon and
 * launch screen the app needs is a crop and a resize of it, so they are
 * generated rather than committed by hand — a re-cut logo means re-running
 * this, not opening an image editor and hoping the padding matches.
 *
 *   node scripts/generate-hr-assets.mjs
 *
 * The outputs are committed, because a build must not depend on this running.
 *
 * Nothing about the source is hardcoded. The first version of this script had
 * the crop measured by hand, which was fine until the logo was replaced with a
 * different one at a different size on a different background and every number
 * in it was silently wrong. Both the bounds and the background are worked out
 * from the file, so swapping the artwork again needs no edit here.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SOURCE = "public/kretiv-hr-logo.png";

/** The app's background, which is what a launch screen has to match. */
const SPLASH_GROUND = { r: 247, g: 244, b: 237, alpha: 1 };
/**
 * The ground an icon sits on.
 *
 * White, because the artwork is drawn for white: a bright yellow mark with a
 * magenta outline reads at any size against it, and a home screen is full of
 * light tiles already.
 */
const ICON_GROUND = { r: 255, g: 255, b: 255, alpha: 1 };

/**
 * How much of an icon the mark fills.
 *
 * `any` is the icon shown as drawn, so the mark can be generous. `maskable`
 * gets cropped to whatever shape the platform likes — Android's worst case is a
 * circle inscribed in the tile — so its content has to stay inside the middle
 * 80%, and a mark sized for `any` would lose its corners.
 */
const FILL = { any: 0.78, maskable: 0.58 };

/** Above this on every channel counts as background rather than artwork. */
const WHITE = 250;
/** Below this is solid artwork. Between the two is an anti-aliased edge. */
const EDGE = 225;

/**
 * The artwork, cropped to its ink and cut out of its background.
 *
 * Handles both shapes of supplied file. A logo delivered with transparency is
 * measured on its alpha; one delivered flattened onto white is measured on how
 * far each pixel is from white, and the white is turned back into transparency
 * so the mark can sit on the app's cream, on the header's dark green, or on a
 * white icon tile without carrying a box around with it.
 *
 * The ramp between EDGE and WHITE is what keeps the cut-out from turning into
 * a staircase: an anti-aliased pixel halfway to white ends up halfway
 * transparent rather than being rounded to one or the other.
 */
async function markArtwork() {
  const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const pixels = Buffer.from(data);

  const suppliedTransparent = pixels.some((_, index) => index % 4 === 3 && pixels[index] === 0);

  if (!suppliedTransparent) {
    for (let index = 0; index < pixels.length; index += 4) {
      const nearest = Math.min(pixels[index], pixels[index + 1], pixels[index + 2]);
      pixels[index + 3] = nearest >= WHITE ? 0
        : nearest >= EDGE ? Math.round((WHITE - nearest) / (WHITE - EDGE) * 255)
          : 255;
    }
  }

  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] <= 8) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) throw new Error(`${SOURCE} appears to be blank.`);

  const bounds = { left, top, width: right - left + 1, height: bottom - top + 1 };
  const png = await sharp(pixels, { raw: { width, height, channels: 4 } }).extract(bounds).png().toBuffer();
  return { png, bounds, keyed: !suppliedTransparent };
}

async function markOn({ mark, size, ground, fill, out }) {
  const target = Math.round(size * fill);
  const fitted = await sharp(mark)
    .resize({ width: target, height: target, fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  const { width, height } = await sharp(fitted).metadata();

  await sharp({ create: { width: size, height: size, channels: 4, background: ground } })
    .composite([{ input: fitted, left: Math.round((size - width) / 2), top: Math.round((size - height) / 2) }])
    .png()
    .toFile(out);
  return out;
}

/**
 * Portrait launch screens, one per device resolution.
 *
 * iOS matches these on exact CSS dimensions and pixel ratio and shows a blank
 * white screen when nothing matches, so the list is the coverage: a device
 * absent here gets no launch screen rather than a stretched one. Point sizes
 * are what the media query compares; the pixel size is what the file has to be.
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

async function splash(mark, { points, ratio }) {
  const [pointWidth, pointHeight] = points;
  const width = pointWidth * ratio;
  const height = pointHeight * ratio;

  // Optically centred: sat slightly high, because dead centre reads as low
  // once the eye accounts for the notch.
  const target = Math.round(width * 0.42);
  const art = await sharp(mark).resize({ width: target }).toBuffer();
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

const { png: mark, bounds, keyed } = await markArtwork();
console.log(`source:   ${SOURCE}`);
console.log(`artwork:  ${bounds.width}x${bounds.height} at ${bounds.left},${bounds.top}${keyed ? " (background keyed out)" : " (supplied transparent)"}`);

const icons = [
  await markOn({ mark, size: 192, ground: ICON_GROUND, fill: FILL.any, out: "public/icons/hr-icon-192.png" }),
  await markOn({ mark, size: 512, ground: ICON_GROUND, fill: FILL.any, out: "public/icons/hr-icon-512.png" }),
  await markOn({ mark, size: 512, ground: ICON_GROUND, fill: FILL.maskable, out: "public/icons/hr-icon-maskable-512.png" }),
  // iOS applies its own rounded mask to this one and never a circular crop, so
  // it takes the generous fill rather than the maskable padding.
  await markOn({ mark, size: 180, ground: ICON_GROUND, fill: FILL.any, out: "public/icons/hr-apple-touch-180.png" }),
];

/*
 * The cut-out mark, for the pages themselves. One asset rather than the mark
 * and wordmark the previous artwork split into — this logo is a single lockup
 * with the "HR" inside the K, and cropping a wordmark out of it would cut the
 * mark in half.
 */
await sharp(mark).resize({ width: 512 }).png().toFile("public/icons/hr-mark.png");

const splashes = [];
for (const device of SPLASH_DEVICES) splashes.push(await splash(mark, device));

/*
 * The media queries, written out rather than hand-maintained: fifteen of them
 * transcribed by hand is fifteen chances to mistype a pixel ratio, and a
 * mistyped one shows up as a white launch screen on exactly one device model
 * that nobody testing happens to own.
 */
const entries = splashes.map(({ out, points, ratio }) => {
  const url = `/${path.relative("public", out).split(path.sep).join("/")}`;
  const media = `(device-width: ${points[0]}px) and (device-height: ${points[1]}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`;
  return `  { url: "${url}", media: "${media}" },`;
}).join("\n");

await writeFile("app/hr/app/startup-images.ts", [
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
].join("\n"));

console.log(`icons:    ${icons.length}`);
console.log(`splashes: ${splashes.length}`);
console.log(`metadata: app/hr/app/startup-images.ts`);
