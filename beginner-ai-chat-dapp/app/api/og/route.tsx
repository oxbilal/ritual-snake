import { ImageResponse } from "next/og";

export const runtime = "edge";

function shortenWallet(wallet: string) {
  if (!wallet || !wallet.startsWith("0x") || wallet.length < 12) return wallet || "Unknown";
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const score = searchParams.get("score") || "0";
  const rank = searchParams.get("rank") || "Beginner";
  const wallet = shortenWallet(searchParams.get("wallet") || "");
  const logoUrl = new URL("/ritual-logo.png", request.url).toString();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#070707",
          color: "white",
          padding: "64px",
          fontFamily: "Arial, sans-serif",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "22px" }}>
          <div
            style={{
              width: "86px",
              height: "86px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "22px",
              background: "#000",
              boxShadow: "0 0 42px rgba(16,185,129,0.45)",
              padding: "12px",
            }}
          >
            <img src={logoUrl} alt="Ritual logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: "34px", fontWeight: 900, color: "#34d399" }}>Ritual Snake</div>
            <div style={{ marginTop: "8px", fontSize: "22px", color: "#71717a" }}>Testnet run confirmed on-chain</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ fontSize: "72px", lineHeight: 1.05, fontWeight: 900, letterSpacing: "0" }}>
            I scored <span style={{ color: "#34d399" }}>{score}</span> on Ritual Snake
          </div>
          <div style={{ display: "flex", gap: "18px", fontSize: "28px" }}>
            <div
              style={{
                display: "flex",
                border: "1px solid rgba(52,211,153,0.35)",
                borderRadius: "999px",
                padding: "14px 22px",
                color: "#34d399",
                background: "rgba(16,185,129,0.1)",
              }}
            >
              Rank: {rank}
            </div>
            <div
              style={{
                display: "flex",
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: "999px",
                padding: "14px 22px",
                color: "#d4d4d8",
                background: "rgba(255,255,255,0.04)",
              }}
            >
              Wallet: {wallet}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "24px" }}>
          <div style={{ color: "#71717a" }}>Built by @0xblp</div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#34d399", fontWeight: 700 }}>
            <span
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "999px",
                background: "#34d399",
              }}
            />
            Chain ID 1979
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
