# Biztrack CM

Biztrack CM is a monorepo for the Biztrack platform. It includes:
- API backend (NestJS)
- Desktop app (Electron + Next.js)
- Shared packages (types, utils, UI components)

## Repo Structure

- `apps/api` — NestJS API server
- `apps/desktop` — Electron desktop app with a Next.js renderer
- `apps/mobile` — Mobile app (if present)
- `packages/types` — Shared TypeScript types
- `packages/utils` — Shared utilities
- `packages/ui` — Shared UI components
- `docs` — Documentation (auth flow, Postman collection, etc.)

## Prerequisites

- Node.js (LTS recommended)
- pnpm

## Install

From the repo root:

```bash
pnpm install
```

## Run the API

```bash
pnpm -C apps/api run dev
```

## Run the Desktop App (Dev)

```bash
pnpm -C apps/desktop run dev:full
```

If `dev:full` has issues on Windows, you can run the processes separately:

```bash
pnpm -C apps/desktop exec tsc -p tsconfig.electron.json -w
pnpm -C apps/desktop run dev
pnpm -C apps/desktop exec electron .
```

## Environment Variables

Copy the example env file and adjust as needed:

```bash
copy .env.example .env
```

## Useful Docs

- `docs/auth-flow.md`
- `docs/auth-module.md`
- `docs/postman/biztrack-api.postman_collection.json`

## First Commit Checklist

1. Create `README.md` (this file)
2. Add documentation files in `docs/`
3. Run the app and ensure it boots

---

If you need help setting up, open an issue or reach out to the team.
