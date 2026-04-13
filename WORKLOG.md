# Worklog

## 2026-04-13 — Initial build: full Lytho Workflow API MCP server, npm publish, plugin

**What changed**: Built the complete Lytho MCP server from scratch. Fetched and mapped the full Lytho Open API (56 endpoints across 6 resource types: workrequest, task, proof, project, campaign, preference). Designed 10 consolidated tools using a `type` enum parameter rather than one-per-endpoint, covering the full surface cleanly. Implemented OAuth 2.0 client credentials flow (Keycloak-hosted) with in-memory token caching and 60s pre-expiry refresh. Used `@modelcontextprotocol/sdk` v1.29 `McpServer.registerTool()` API (the `Server` class is deprecated) with Zod v4 schemas for parameter validation. All IDs typed as `z.number().int()` (API spec: int32). Published as `@oliverames/lytho-mcp-server@1.0.2` to npm. Created GitHub repo `oliverames/lytho-mcp-server`. Added Lytho logo (175x105 wordmark PNG from API docs S3 bucket). Created `ames-lytho` plugin in ames-claude marketplace. Created 1Password item in Development vault for OAuth credentials. Created Apple Notes "Lytho MCP Server" in 💻 Tech.

**Decisions made**:
- **10 tools over 56**: The API's 6 resources share identical CRUD patterns. A `type` enum (`workrequest | task | proof | project | campaign`) covers all resources with one tool per operation, keeping Claude's context lean. Pattern from skill: "hybrid" -- dedicated tools for distinct operations, not one-per-endpoint.
- **Root `index.js` wrapper**: npm strips bin entries whose file paths contain a subdirectory (e.g. `./dist/index.js`). Root-level `index.js` (`#!/usr/bin/env node\nimport './dist/index.js';`) is the bin target; `dist/index.js` holds the compiled TypeScript. `postbuild` script runs `chmod +x dist/index.js` to avoid npm stripping the bin on future publishes.
- **Zod v4**: SDK 1.29 supports `^3.25 || ^4.0`. Used Zod v4 (latest). No compatibility issues.
- **`McpServer.registerTool()`**: The high-level `McpServer` class from `@modelcontextprotocol/sdk/server/mcp.js` is the current API. The low-level `Server` with `setRequestHandler` is deprecated as of v1.x.
- **Auth stored in 1Password**: Client ID `wf-oa-f526ceb7-e4e6-449d-850f-e797a38cc886` and token URL visible in Lytho settings screenshot. Client secret is a placeholder in 1Password -- needs to be updated from the actual Lytho settings page.
- **npm versions 1.0.0 and 1.0.1 published without working bin**: 1.0.2 is the first clean publish. The 1.0.0/1.0.1 packages exist on npm but lack a `lytho-mcp-server` bin entry.

**Left off at**:
- Client secret needs to be added to 1Password "Lytho Workflow Open API" item (currently a placeholder)
- Test the server end-to-end with real Lytho credentials once secret is entered
- Verify `npx -y @oliverames/lytho-mcp-server@latest` works correctly from the plugin `.mcp.json`
- The sources snapshot in `ames-lytho/sources/lytho-mcp-server/` is a manual copy -- no `update.sh` yet (unlike YNAB which also lacks one; see ames-claude worklog)
- Deprecate/yank 1.0.0 and 1.0.1 from npm (`npm deprecate`) to avoid users accidentally picking up the broken bin versions

**Open questions**:
- Should `pageSizeSchema` use `z.union([z.literal(10), z.literal(20), z.literal(30)])` or just `z.number().int()` with `.min(10).max(30)`? Current approach is union of literals, matching the API's allowed values exactly.
- Lytho API uses `operatorMode` (1=Or, 2=And) on search -- is this used anywhere in practice or always omitted?

---
