import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This project's AI-agent instructions live at .claude/CLAUDE.md (see
  // .planning/config.json claude_md_path); disable Next's own auto-generated
  // root AGENTS.md/CLAUDE.md so it doesn't shadow/conflict with that file.
  agentRules: false,
  // better-sqlite3's native binding and its Prisma driver adapter cannot be
  // traced into the server bundle -- leaving them bundled makes `npm run
  // build` fail on the native module (03-RESEARCH.md Standard Stack).
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
};

export default nextConfig;
