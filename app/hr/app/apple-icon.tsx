import { ImageResponse } from "next/og";

/**
 * The same mark at the size iOS asks for.
 *
 * Safari prefers `apple-touch-icon` over anything in the manifest, so without
 * this file the root layout's `icons.apple` wins and the installed HR app looks
 * exactly like KretivOS. iOS applies its own rounded mask, so this is drawn
 * full-bleed with no corner radius of its own.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#202c25",
          color: "#f7f4ed",
          fontSize: 78,
          fontWeight: 700,
          letterSpacing: -4,
        }}
      >
        HR
      </div>
    ),
    size,
  );
}
