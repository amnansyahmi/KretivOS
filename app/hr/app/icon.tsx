import { ImageResponse } from "next/og";

/**
 * The employee app's own mark.
 *
 * Without this the app inherits `icons` from the root layout, so installing it
 * puts a second icon on the home screen that is pixel-identical to KretivOS —
 * two apps that look the same and open to different places. Generated rather
 * than committed as a PNG so there is one definition of it, next to the app it
 * belongs to.
 */
export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
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
          fontSize: 84,
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
