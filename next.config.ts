import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: ".next-local",
  turbopack: {
    root: process.cwd(),
  },
  typedRoutes: true,
};

export default nextConfig;
