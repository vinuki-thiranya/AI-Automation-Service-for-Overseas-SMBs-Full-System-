import { ImageResponse } from "next/og";

// One share image for the site: the after-hours night band with the logo and the brand line. Pages get
// their own title through metadata. Colours are the night-band tokens from MASTER.md (an image can't
// read CSS variables).
export const alt = "Nuvadesk: your front desk, still answering at 9:47 pm";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const NIGHT = "#10243a";
const INK = "#eaf1f2";
const MUTED = "#a9bac3";
const BRAND = "#5cc3c9";
const MARIGOLD = "#f5c25b";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: NIGHT, color: INK }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>
          <svg viewBox="0 0 32 32" width="60" height="60">
            <rect x="1.5" y="1.5" width="29" height="29" rx="8.5" fill="#0b5d6b" stroke={BRAND} strokeOpacity="0.6" strokeWidth="1" />
            <path d="M9.5 23.5v-8.2a6.5 6.5 0 0 1 13 0v3.2" fill="none" stroke="#ffffff" strokeWidth="3.6" strokeLinecap="round" />
            <path d="M18.6 21.2l3.6 3.4 5.6-7.4" fill="none" stroke={MARIGOLD} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Nuvadesk
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2.5, maxWidth: 940 }}>Your front desk, still answering at 9:47 pm.</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 30, fontSize: 30, color: MUTED }}>
            <div style={{ display: "flex", padding: "6px 16px", borderRadius: 10, background: MARIGOLD, color: "#2a1e00", fontWeight: 700 }}>Booked 8:15</div>
            An AI front desk for clinics, installed in 14 days.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
