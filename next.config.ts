import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only LAN access from any IP (Wi-Fi/hotspot/VPN) without per-network
  // edits. The `dev` script is local/LAN, never production, so "*" is safe here.
  allowedDevOrigins: ["*"],
};

export default nextConfig;
