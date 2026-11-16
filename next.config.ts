import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (the local zero-setup database) ships WebAssembly files, so it must be
  // loaded from node_modules at runtime instead of being bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
