import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This project's AI-agent instructions live at .claude/CLAUDE.md (see
  // .planning/config.json claude_md_path); disable Next's own auto-generated
  // root AGENTS.md/CLAUDE.md so it doesn't shadow/conflict with that file.
  agentRules: false,
};

export default nextConfig;
