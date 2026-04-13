<p align="center">
  <img src="icon.png" width="200" alt="Lytho">
</p>

<h1 align="center">Lytho MCP Server</h1>

<p align="center">
  <strong>The complete Model Context Protocol server for Lytho Workflow</strong><br>
  <em>Give your AI assistant full access to your creative operations platform</em>
</p>

<p align="center">
  <code>10 tools</code> &bull;
  <code>56 API endpoints</code> &bull;
  <code>OAuth 2.0</code>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@oliverames/lytho-mcp-server">
    <img src="https://img.shields.io/npm/v/%40oliverames%2Flytho-mcp-server?style=flat-square&color=f5a542" alt="npm">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-f5a542?style=flat-square" alt="License">
  </a>
  <a href="https://www.buymeacoffee.com/oliverames">
    <img src="https://img.shields.io/badge/Buy_Me_a_Coffee-support-f5a542?style=flat-square&logo=buy-me-a-coffee&logoColor=white" alt="Buy Me a Coffee">
  </a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#what-you-can-do">What You Can Do</a> &bull;
  <a href="#tools-reference">All 10 Tools</a> &bull;
  <a href="#environment-variables">Configuration</a>
</p>

---

## Why This Exists

Lytho is a creative operations platform where work lives across projects, campaigns, tasks, proofs, and work requests — often in ways that require context-switching to understand the full picture. Querying status across resource types, finding items by name, or making batch updates all require navigating the UI manually or writing custom API integrations.

This server gives your AI assistant full read/write access to the [Lytho Workflow Open API](https://openapi-docs.wf.lytho.us/), covering all 56 documented endpoints through 10 well-designed tools. Because Lytho's six resource types (work requests, tasks, proofs, projects, campaigns, preferences) share a consistent REST structure, the tools use a `type` parameter to cover the full surface cleanly — so Claude never needs to switch mental models to work across resource types.

Authentication uses Lytho's OAuth 2.0 client credentials flow (Keycloak-hosted). The server fetches a Bearer token automatically on first use, caches it, and refreshes it transparently before expiry.

---

## Quick Start

### 1. Get Your Lytho API Credentials

In your Lytho workspace, navigate to **Settings → Open API**. You'll find:
- **Client ID** — a `wf-oa-` prefixed identifier
- **Client Secret** — reset and copy from the settings page
- **Token URL** — tenant-specific, in the format `https://login.us-1.lytho.us/auth/realms/YOUR_TENANT/protocol/openid-connect/token`

### 2. Configure Your MCP Client

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "lytho": {
      "command": "npx",
      "args": ["-y", "@oliverames/lytho-mcp-server"],
      "env": {
        "LYTHO_CLIENT_ID": "wf-oa-your-client-id",
        "LYTHO_CLIENT_SECRET": "your-client-secret",
        "LYTHO_TOKEN_URL": "https://login.us-1.lytho.us/auth/realms/your-tenant/protocol/openid-connect/token"
      }
    }
  }
}
```

**Claude Code** (`.mcp.json`):

```json
{
  "mcpServers": {
    "lytho": {
      "command": "npx",
      "args": ["-y", "@oliverames/lytho-mcp-server"],
      "env": {
        "LYTHO_CLIENT_ID": "wf-oa-your-client-id",
        "LYTHO_CLIENT_SECRET": "your-client-secret",
        "LYTHO_TOKEN_URL": "https://login.us-1.lytho.us/auth/realms/your-tenant/protocol/openid-connect/token"
      }
    }
  }
}
```

That's it. Your AI can now read and update Lytho.

---

## What You Can Do

| Ask your AI... | What happens under the hood |
|---|---|
| "Find all active projects named 'Brand Refresh'" | `search_items` with type=project, name="Brand Refresh" |
| "What tasks are assigned to this campaign?" | `get_users` + `search_items` with type=task |
| "Show me the description for proof #4821" | `get_description` with type=proof, id=4821 |
| "Get all comments on work request #1102" | `get_comments` with type=workrequest, id=1102 |
| "What files are attached to project #305?" | `get_files` with type=project, id=305 |
| "Update the name of task #9034" | `update_item` with JSON Patch replace on /name |
| "Fetch tasks #100, #101, and #102 at once" | `list_items` with type=task, ids=[100,101,102] |
| "Get the descriptions for all proofs in this sprint" | `list_descriptions` with type=proof, ids=[...] |
| "Who is assigned to campaign #77?" | `get_users` with type=campaign, id=77 |
| "What are my current user preferences?" | `list_preferences` |

---

## Features

**Complete Lytho Open API coverage** across all resource types:

| Resource | Supported Operations |
|----------|---------------------|
| **Work Requests** | Search, get, list by IDs, update (JSON Patch), comments, deliverable file URLs, users |
| **Tasks** | Search, get, list by IDs, update, comments, file URLs, users, description, batch descriptions |
| **Proofs** | Search, get, list by IDs, update, comments, file URLs, users, description, batch descriptions |
| **Projects** | Search, get, list by IDs, update, comments, file URLs, users, description, batch descriptions |
| **Campaigns** | Search, get, list by IDs, update, comments, file URLs, users, description, batch descriptions |
| **Preferences** | Get by ID, batch by IDs, list all |

### Design Decisions

- **One `type` parameter covers six resources** — rather than 60 separate tools (one per resource per operation), a `type` enum (`workrequest | task | proof | project | campaign`) keeps the tool list to 10. Claude never needs to know which specific endpoint to call; it picks the right resource type naturally.
- **Automatic token management** — OAuth 2.0 client credentials are exchanged for a Bearer token on first call, cached in memory, and refreshed 60 seconds before expiry. No manual token rotation.
- **JSON Patch updates (RFC 6902)** — updates use the standard JSON Patch format. Use a `test` operation before `replace` to guard against concurrent edits (Lytho returns 409 on test failure).
- **WorkRequest file path handled automatically** — work requests use `/deliverablefiles/urls` while all other types use `/files/urls`. The `get_files` tool routes correctly based on type.
- **Integer IDs throughout** — Lytho item IDs are `int32`. All ID parameters are typed as integers so Claude never quotes numeric IDs or passes string representations.
- **Batch operations** — `list_items`, `list_descriptions`, and `list_preferences` all accept ID arrays, enabling efficient bulk reads in a single round trip.
- **Paginated responses** — all list endpoints support `page` and `pageSize` (10, 20, or 30) parameters, with total count metadata in the response.

---

## Tools Reference

### Search & Retrieval

| Tool | Description |
|------|-------------|
| `search_items` | Search any resource type by name (partial match) and/or archived status. Returns matching item IDs for follow-up retrieval. |
| `get_item` | Retrieve a single item by type and integer ID. |
| `list_items` | Batch-retrieve multiple items by type and an array of IDs. Paginated. |

### Updates

| Tool | Description |
|------|-------------|
| `update_item` | Update any item via JSON Patch operations (RFC 6902). Supports `test`, `replace`, `add`, and `remove` ops. Use `test` first to prevent overwriting concurrent changes. |

### Sub-Resources

| Tool | Description |
|------|-------------|
| `get_comments` | Get paginated comments for any item. Supports format selection (html or plain). |
| `get_files` | Get downloadable file URLs. Work requests return deliverable files; all other types return general attachments. |
| `get_users` | Get users associated with any item. |

### Descriptions

| Tool | Description |
|------|-------------|
| `get_description` | Get the rich-text description for a task, proof, project, or campaign. Not available on work requests. |
| `list_descriptions` | Batch-retrieve descriptions for multiple items of the same type in a single request. |

### Preferences

| Tool | Description |
|------|-------------|
| `list_preferences` | Get user preferences. Pass `id` for a single preference, `ids` for a batch, or omit both to list all. |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LYTHO_CLIENT_ID` | Yes | OAuth 2.0 client ID from Lytho Open API settings. Begins with `wf-oa-`. |
| `LYTHO_CLIENT_SECRET` | Yes | OAuth 2.0 client secret. Reset and copy from the same settings page. |
| `LYTHO_TOKEN_URL` | Yes | Keycloak token endpoint. Tenant-specific — copy it exactly from your Lytho Open API settings page. |

### How Authentication Works

The server uses the [OAuth 2.0 client credentials flow](https://oauth.net/2/grant-types/client-credentials/):

1. On first API call, sends a `POST` to `LYTHO_TOKEN_URL` with `Authorization: Basic base64(clientId:clientSecret)` and body `grant_type=client_credentials`
2. Receives a Bearer token with an expiry (`expires_in` seconds)
3. Caches the token in memory, refreshing automatically 60 seconds before expiry
4. Uses `Authorization: Bearer <token>` on all subsequent Lytho API calls

The token endpoint is hosted on Keycloak. Your tenant name appears in the realm segment of the URL (e.g. `/realms/acme-corp/`).

---

## Architecture

```
┌─────────────────────┐     ┌────────────────────────┐     ┌───────────────────────┐
│  AI Assistant       │────▶│  Lytho MCP Server      │────▶│  Lytho Open API       │
│  (Claude, GPT, etc) │◀────│  (this package)        │◀────│  openapi.wf.lytho.us  │
└─────────────────────┘     └────────────────────────┘     └───────────────────────┘
         MCP                      stdio transport                  HTTPS/REST
                                       │
                                       ▼
                              ┌─────────────────┐
                              │  Keycloak OAuth  │
                              │  Token Endpoint  │
                              └─────────────────┘
```

- **Transport:** stdio (standard MCP server pattern)
- **Auth:** OAuth 2.0 client credentials → Bearer token, cached with auto-refresh
- **Validation:** All parameters validated with [Zod](https://zod.dev) schemas
- **Language:** TypeScript, compiled to ESM JavaScript
- **Error handling:** API errors are caught, formatted, and returned as MCP error responses with status code and body

---

## Development

```bash
git clone https://github.com/oliverames/lytho-mcp-server.git
cd lytho-mcp-server
npm install
npm run build
LYTHO_CLIENT_ID=wf-oa-... \
LYTHO_CLIENT_SECRET=... \
LYTHO_TOKEN_URL=https://login.us-1.lytho.us/auth/realms/your-tenant/protocol/openid-connect/token \
npm start
```

### Publishing

```bash
./publish.sh          # patch bump (1.0.0 → 1.0.1)
./publish.sh minor    # minor bump (1.0.0 → 1.1.0)
./publish.sh major    # major bump (1.0.0 → 2.0.0)
```

The publish script bumps the version in `package.json`, runs `tsc`, does a dry-run verification, then publishes to npm with `--access public`.

### Dependencies

- [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — MCP server framework
- [`zod`](https://www.npmjs.com/package/zod) — Runtime schema validation

---

## License

MIT

---

<p align="center">
  <a href="https://www.buymeacoffee.com/oliverames">
    <img src="https://img.shields.io/badge/Buy_Me_a_Coffee-support-f5a542?style=for-the-badge&logo=buy-me-a-coffee&logoColor=white" alt="Buy Me a Coffee">
  </a>
</p>

<p align="center">
  <sub>
    Built by <a href="https://ames.consulting">Oliver Ames</a> in Vermont
    &bull; <a href="https://github.com/oliverames">GitHub</a>
    &bull; <a href="https://linkedin.com/in/oliverames">LinkedIn</a>
    &bull; <a href="https://bsky.app/profile/oliverames.bsky.social">Bluesky</a>
  </sub>
</p>
