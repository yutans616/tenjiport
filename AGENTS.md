<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# マルチPC作業時の引き継ぎ

このプロジェクトはOneDrive上にあり複数PCから開かれるが、Claude Codeのチャット履歴はPCごとにローカル保存され同期されない。作業開始時は必ず [docs/handoff.md](./docs/handoff.md) を読み、直近の状況・次にやること・注意事項を把握すること。作業を区切る際（そのPCでの作業を終える、別PCに引き継ぐ、など）は、そのファイルの「現在の状況」を最新化すること。
