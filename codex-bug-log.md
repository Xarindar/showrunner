# Codex Bug Log

## 2026-06-20

- `npm run build` fails before Next.js compilation in the clean `main` worktree because Prisma cannot resolve `DATABASE_URL`. The worktree only has `.env.example`, so this appears to be environment setup rather than a module UI regression.
- `npx next dev -p 3017` fails in the clean `main` worktree with a Turbopack panic: `Symlink [project]/node_modules is invalid, it points out of the filesystem root`. This appears to be caused by the linked `node_modules` in the git worktree rather than these module layout changes.
- `npx next dev --webpack -p 3017` starts, but the shared `/admin/modules/[moduleId]` route compile did not finish; a direct request to `/admin/modules/products` timed out after 45 seconds. Browser verification against this clean worktree is blocked until the dev-server compile issue is resolved.
