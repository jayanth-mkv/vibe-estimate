import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@vibeestimate/scene-schema", "@vibeestimate/scene-core", "@vibeestimate/pascal-adapter", "@pascal-app/core", "@pascal-app/nodes", "@pascal-app/viewer", "@pascal-app/editor"],
  experimental: { cpus: 2 },
  poweredByHeader: false,
  turbopack: { root: path.resolve(process.cwd(), "..") },
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ] }];
  },
};

export default nextConfig;
