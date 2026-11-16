import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (the local zero-setup database) ships WebAssembly files, so it must be
  // loaded from node_modules at runtime instead of being bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Do not auto-generate AGENTS.md / CLAUDE.md files into the repository.
  agentRules: false,
};

export default nextConfig;
