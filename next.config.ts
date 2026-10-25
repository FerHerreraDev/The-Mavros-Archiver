import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Las pruebas E2E construyen en otra carpeta para no pisar el build normal
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
