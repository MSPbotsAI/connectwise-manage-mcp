# Module: connectwise-manage-mcp

Repo: `https://github.com/MSPbotsAI/connectwise-manage-mcp`. An MCP server that wraps the
ConnectWise Manage REST API as a set of `cw_*` tools (`src/tools/*.ts`), behind a single
per-request `CwManageClient` (`src/api-client.ts`) built in `createMcpServer()`
(`src/mcp-server.ts`). No database of its own — every tool is a pass-through to ConnectWise
Manage's REST API.

## PRD-20969 · 2026-10-23

Status: pending merge to `main` — this module doc's `path:line` references are on work branch
`dev01.mbagent/PRD-20969` @ `eab3d7e`, not yet on `main`. Base branch at the time this
branch was cut: `main` @ `f4f85f8`.

- **Multi-tenant isolation is structural, not argument-based.** `createMcpServer(configOverride?)`
  (`src/mcp-server.ts:100`) builds exactly one `CwManageClient` per invocation
  (`src/mcp-server.ts:156`, `const client = new CwManageClient(config)`) and passes that same
  `client` into every `register*Tools(server, client)` call (e.g. `:162` `registerTimeEntryTools`,
  `:166` `registerServiceTools`). No tool takes a tenant identifier as a caller-supplied argument;
  the active tenant is entirely determined by which credentials the gateway/env injected for that
  `createMcpServer()` call. Any new tool added to this repo should follow the same shape — never
  import a module-level `CwManageClient` singleton.
- **The "forward a field to the request body only when the caller supplies it" convention** is used
  throughout every create/update tool (e.g. `src/tools/tickets.ts` `cw_create_ticket`,
  `src/tools/time-entries.ts` `cw_create_time_entry`): guard with `if (x !== undefined)` for values
  that are meaningfully falsy (numbers, booleans) or `if (x)` for strings/ids where `0`/`""` are not
  valid inputs anyway. This repo has no central validation layer beyond each tool's own zod schema.
- **The `cw_list_*` board-scoped lookup pattern**: `GET /service/boards/{boardId}/<resource>` with
  `boardId` required (schema-enforced, rejects before any HTTP call), `conditions`/`page`/`pageSize`
  optional with defaults `page=1`, `pageSize=25`. Established by `cw_list_statuses`
  (`src/tools/service.ts`, pre-existing) and extended by `cw_list_ticket_types`,
  `cw_list_ticket_subtypes`, `cw_list_ticket_items` (PRD-20969). Global (non-board-scoped) lookups
  like `cw_list_work_types` / `cw_list_work_roles` (`src/tools/time-entries.ts`, PRD-20969) use the
  same `conditions`/`page`/`pageSize` shape with no required field.
- **Test convention**: this repo has no live-ConnectWise integration tests (confirmed by reading all
  12 pre-existing files under `src/__tests__/` as of PRD-20969's design, 2026-10-21). Every test
  drives a tool's registered handler against a hand-rolled `StubClient` implementing
  `get`/`post`/`patch`/`delete` and records calls, then asserts on the recorded `path`/`params`/`body`
  — see `src/__tests__/procurement.test.ts` for the clearest example of this pattern, and
  `src/__tests__/service.test.ts` / `src/__tests__/tickets.test.ts` / `src/__tests__/time-entries.test.ts`
  (PRD-20969) for three more instances of it.
- **Two tests hard-code the total registered tool count** and must be bumped by any ticket that adds
  or removes a tool: `src/__tests__/ticket-configurations.test.ts` (`expect(tools).toHaveLength(N)`)
  and `src/__tests__/update-contact.test.ts` (`expect(names).toHaveLength(N)`). PRD-20969 bumped both
  from 87 to 92 (added 5 tools, removed none). If a future ticket's gate fails on one of these two
  assertions, this is very likely why — update the literal, don't silence the test.
- **Versioning is automatic**: `semantic-release` (`.releaserc.json`, triggers on `main`) generates
  the changelog, bumps `package.json`'s version, and creates the GitHub release on merge. No ticket
  in this pipeline should hand-edit `package.json`'s version or `CHANGELOG.md`.
