# Backend OpenAPI Automation Plan

**Purpose:** Ship a dynamic Swagger/OpenAPI surface for the backend that always matches the TypeScript route implementations and the shared `@app-monitor/api-contracts` package.  
**Status:** Draft — November 16, 2025  
**Delete After:** Replace with an architecture doc once the automation is live in production.

---

## Background & Goals

The backend currently relies on `shared/api-contracts` for request/response DTOs, but there is no canonical OpenAPI document. Consumers (frontend, integrations, ops scripts) must read code to understand endpoints, and test automation cannot lint against a machine-readable spec. The goal is to:

1. Produce an OpenAPI 3.1 document directly from the existing TypeScript contracts and route definitions.  
2. Serve a Swagger UI (`/api/docs`) and downloadable JSON that updates automatically when routes or contracts change.  
3. Integrate spec generation into CI/CD so PRs fail if the spec and implementation diverge.  
4. Reuse the spec to drive SDK/test generation without duplicating schemas, in line with the documentation philosophy (single source, delete redundant copies).

---

## Constraints

- **Master Design Intent alignment:** Event-driven/backend-only automation (no cron), SQLite remains the state source of truth, and the dev-bot pause/resume guarantees stay unaffected.  
- **Documentation policy:** Only create this technical design during implementation; final architecture updates replace it, redundant artifacts must be deleted.  
- **Shared contracts stay authoritative:** `shared/api-contracts/index.ts` remains the only place to define DTOs. Route handlers must import those types; no inline schemas.  
- **Minimal manual steps:** Engineers should not hand-edit YAML/JSON files. Scripts must run in CI and via `pnpm generate:openapi`.

---

## Industry Research & Best Practices

1. **CI validation + testing:** Modern OpenAPI workflows add `swagger-cli` validation and tools like Dredd to CI so every PR checks both the spec and live API responses before merge.citeturn0search2  
2. **Express + TypeScript integration:** Teams generating specs from Express apps commonly use tooling such as `swagger-jsdoc`, `express-openapi`, or TypeScript-aware builders (ts-morph, openapi-typescript) to keep code and spec in lockstep.citeturn0search3  
3. **Docs as automation guardrails:** Publishing the generated spec (e.g., committing artifacts or exposing `/swagger`) plus CI guardrails ensures customers always see the latest docs and PRs fail when the spec drifts.citeturn0search6  
4. **Spec-driven testing:** Once the spec exists, services like Codespell/Katalon (or internal tooling) can auto-generate regression tests from Swagger, reinforcing the need for an accurate, machine-readable doc.citeturn0search4  
5. **Client/SDK reuse:** OpenAPI specs feed generators (Swagger Codegen/OpenAPI Generator) to ship typed clients in many languages, multiplying the benefit of keeping the spec synced with code.citeturn0search0

---

## Proposed Architecture

### 1. Source-of-Truth Layers

| Layer | Responsibility | Notes |
|-------|----------------|-------|
| `shared/api-contracts` | DTO/type declarations | Continue exporting every request/response interface here. |
| `backend/src/routes/**` | Route metadata | Each route exports a `defineRoute()` descriptor (method, path, handler, contract references). |
| `tools/openapi-builder` | AST/introspection | Reads descriptors + TypeScript types to emit OpenAPI JSON. |
| `shared/api-contracts/dist/openapi.json` | Published artifact | Generated file checked into repo, versioned alongside contracts. |

### 2. Route Instrumentation

1. Introduce `defineRoute({ method, path, summary, description, request, response, tags })` helper in `backend/src/routes/routeRegistry.ts`.  
2. Refactor each router (e.g., `dev-bots/plans.routes.ts`, `github-webhooks.routes.ts`) to register metadata alongside the Express handler.  
3. Register middleware schemas (query params, headers) using contract references.  
4. Store descriptors in a central registry that the generator can import without instantiating Express (pure data module).

### 3. Type-to-Schema Generator

1. Build `tools/openapi-builder/index.ts` using `ts-morph` + `ts-json-schema-generator` to convert referenced interfaces into JSON Schema, then wrap with OpenAPI components.  
2. Map enums/unions to `oneOf/allOf` as needed; enforce explicit tags/responses.  
3. Support `@openapi` JSDoc tags on route descriptors for overrides (e.g., auth requirements, examples).  
4. Emit:
   - `shared/api-contracts/dist/openapi.json` (machine file)  
   - `shared/api-contracts/dist/openapi.yaml` (optional, easier diff)  
   - TypeScript declaration `openapi.generated.ts` exporting the spec object for tests.

### 4. Dynamic Serving

1. Add `backend/src/routes/openapi.routes.ts` exposing:  
   - `GET /api/docs/json` → raw JSON (with ETag, Cache-Control)  
   - `GET /api/docs` → Swagger UI (via `swagger-ui-express`) reading the JSON endpoint.  
2. On backend boot (non-production), watch `shared/api-contracts`, route descriptors, and regenerate spec in-memory for hot reload. In production, load the generated artifact from disk (ensures deterministic builds).  
3. Emit `documentation` Socket.IO events whenever the spec hash changes so frontend panels can refresh automatically if needed.

### 5. CI/CD Guardrails

1. `pnpm lint:openapi` runs `swagger-cli validate dist/openapi.json`.  
2. `pnpm test:contract` can run Dredd (or Schemathesis) using a preview server to ensure implementation matches the spec before merge.  
3. GitHub Action adds two checks (both required on **every** PR targeting `main`, aligning with the master-design intent’s “CI gatekeeping” rule):
   - `Spec sync`: fails if `openapi.json` is outdated vs. generator output.  
   - `Spec validation`: fails if schema or tests break.  
4. The PR must not merge while either check is red; fixes happen on the branch and CI reruns before merge.  
5. Nightly job publishes the spec artifact to an S3 bucket (or GitHub Pages) for partners; include version stamped with git SHA.

### 6. Downstream Consumers

- **Frontend:** Optionally use `openapi-typescript` to re-generate typed API clients from the spec instead of ad-hoc `api-contracts` imports for REST calls.  
- **Integration bots/tests:** Hook existing shared mocking utilities to the spec for auto-mocking.  
- **External partners:** Provide the JSON/YAML artifact plus changelog in release notes (aligns with documentation deletion rules by avoiding extra narrative docs).

---

## Validation & Observability

1. **Hash comparison:** Store the spec SHA in `shared/api-contracts/dist/openapi.sha` so the backend can log mismatches at startup.  
2. **Route coverage metric:** During generation, count Express routes vs. documented routes and emit metrics via existing telemetry.  
3. **Spec drift alerts:** If a handler executes with an unrecognized path/method (router fallback), emit `openapi:drift_detected` events for alerting.  
4. **Docs availability:** Health check includes `/api/docs/json` status; CI runs uptime tests after deploy.

---

## Implementation Plan

1. **Foundations (Day 1-2)**  
   - Create `tools/openapi-builder` scaffold, add deps (`ts-morph`, `ts-json-schema-generator`, `swagger-ui-express`).  
   - Seed `pnpm generate:openapi` script and baseline CI job.

2. **Route Instrumentation (Day 2-4)**  
   - Implement `defineRoute` helper + registry.  
   - Refactor routers incrementally (start with health, docker, dev-bots).  
   - Add lint rule ensuring every route registers metadata.

3. **Schema Generation (Day 4-6)**  
   - Convert referenced interfaces into OpenAPI components.  
   - Handle unions, enums, pagination helpers, error envelopes.  
   - Emit curated tags and securitySchemes (e.g., API key, session cookie).

4. **Runtime & UI (Day 6-7)**  
   - Expose `/api/docs` + `/api/docs/json`.  
   - Add hot-reload in dev via chokidar watcher; production loads static artifact.  
   - Document usage in `docs/guides/API_ACCESS.md` (new or existing).

5. **CI/Test Integration (Day 7-8)**  
   - Add `swagger-cli validate` + Dredd job.  
   - Fail PR if `openapi.json` differs from generated output.  
   - Publish artifact to release assets or S3.

6. **Adoption & Cleanup (Day 8-9)**  
   - Update frontend mock utilities to optionally load OpenAPI for contract tests.  
   - Delete this technical design after architecture docs are updated and spec automation is live.

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Complex TypeScript constructs (conditional types, generics) | Generator may emit incomplete schemas | Limit route descriptors to explicit interfaces; add schema overrides via JSDoc if needed. |
| Build-time cost | Generation might slow CI | Cache TypeScript program analysis, reuse `tsconfig` outputs, run generator only when contracts/routes change. |
| Spec drift due to manual edits | Inaccurate docs | Block commits that modify `openapi.json` without running generator; CI diff check enforces this. |
| Swagger UI exposure | Sensitive endpoints may be discoverable | Require auth for `/api/docs`, redact internal-only routes via `x-internal` flag before publishing external artifact. |

---

## Open Questions

1. Do we need multiple published variants (internal full spec vs. external subset)?  
2. Should the spec also describe Socket.IO events (OpenAPI does not natively cover WebSockets)? Possibly use `x-socket-events`.  
3. Where should we host the external artifact (GitHub Pages vs. Cloudflare R2) to stay within existing infrastructure constraints?

--- 

Once the implementation ships and architecture docs are updated, delete this file per the documentation lifecycle rules.
