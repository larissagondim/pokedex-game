import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker builds a self-contained server (web/Dockerfile); `next start` and Vercel use the default.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
