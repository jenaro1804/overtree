import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only LAN access from any IP (Wi-Fi/hotspot/VPN) without per-network
  // edits. The `dev` script is local/LAN, never production, so "*" is safe here.
  allowedDevOrigins: ["*"],
  // Belt-and-suspenders: yjs is supposed to load ONLY in the tsx-run custom
  // server's graph now (the API routes reach doc-manager through the globalThis
  // bridge in lib/yjs/doc-manager-bridge.ts, not by importing it). Should some
  // future server-side route import yjs anyway, keep it external so webpack does
  // not bundle a SECOND copy → avoids the "Yjs was already imported" warning
  // (yjs#438) and cross-copy `Y.Doc` breakage.
  serverExternalPackages: ["yjs", "y-protocols", "lib0"],
};

export default nextConfig;
