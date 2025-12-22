# AGENTS.md

## Project snapshot
- Package: `@monotykamary/flame` (TypeScript, Bun, Effect)
- Purpose: FLAME-style remote execution with parent/runner/local modes
- Entry point: `src/index.ts`

## Daily commands
- Install: `bun install`
- Unit tests: `bun test tests/unit`
- Integration tests: `bun test tests/integration`
- Smoke tests: `bun test tests/smoke`
- All tests: `bun test`
- Coverage: `bun test --coverage`
- E2E (Docker): `docker compose up --build --exit-code-from parent`
- Lint: `bun lint`
- Effect diagnostics: `effect-language-service diagnostics --format pretty --project ./tsconfig.json`
- Typecheck: `bun x tsc --noEmit`
- Build: `bun build src/index.ts --outdir dist`

## Layout notes
- Core runtime: `src/flame.ts`, `src/runtime.ts`, `src/registry.ts`
- Method definition: `src/define.ts`, `src/types.ts`
- Runner HTTP path and invocation: `src/runner/`, `src/invoke.ts`
- Serialization and security: `src/serialization.ts`, `src/security.ts`
- Tests: `tests/unit`, `tests/integration`, `tests/smoke`, `tests/e2e`

## Contribution tips
- Keep method/service IDs stable; they are part of the public contract.
- Prefer structured data (Superjson-compatible) for arguments/results.
- Update `README.md` for user-facing behavior changes.
- Avoid adding non-Bun tooling unless required; Bun is the default runtime.
