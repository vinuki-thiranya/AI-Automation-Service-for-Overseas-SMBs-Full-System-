import { ImageResponse } from "next/og";

// One share image for the site, in the after-hours palette. Pages get their own title through
// metadata; the image carries the brand line.
export const alt = "Nuvadesk: your front desk, still answering at 9:47 pm";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#131b2e", color: "#e9eef5" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 36, fontWeight: 700 }}>
          <div style={{ width: 48, height: 48, borderRadius: 11, background: "#7fc4ae", display: "flex", alignItems: "center", justifyContent: "center", color: "#0f1a17", fontSize: 30 }}>N</div>
          Nuvadesk
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, maxWidth: 900 }}>Your front desk, still answering at 9:47 pm.</div>
          <div style={{ marginTop: 28, fontSize: 30, color: "#a9b4c6" }}>An AI front desk for clinics, installed in 14 days.</div>
        </div>
      </div>
    ),
    size,
  );
}
