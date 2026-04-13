#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
const API_BASE = "https://openapi.wf.lytho.us/v1";
let tokenCache = null;
async function getAccessToken() {
    // Return cached token if still valid (with a 60s buffer before expiry)
    if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
        return tokenCache.accessToken;
    }
    const clientId = process.env.LYTHO_CLIENT_ID;
    const clientSecret = process.env.LYTHO_CLIENT_SECRET;
    const tokenUrl = process.env.LYTHO_TOKEN_URL;
    if (!clientId || !clientSecret || !tokenUrl) {
        throw new Error("Missing required environment variables. Set LYTHO_CLIENT_ID, " +
            "LYTHO_CLIENT_SECRET, and LYTHO_TOKEN_URL.");
    }
    // Basic auth: base64(clientId:clientSecret)
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await fetch(tokenUrl, {
        method: "POST",
        headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ grant_type: "client_credentials" }),
    });
    if (!response.ok) {
        const body = await response.text().catch(() => "(no body)");
        throw new Error(`Lytho token request failed ${response.status} ${response.statusText}: ${body}`);
    }
    const data = (await response.json());
    tokenCache = {
        accessToken: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000,
    };
    return tokenCache.accessToken;
}
// ─────────────────────────────────────────────────────────────────────────────
const RESOURCE_TYPES = ["workrequest", "task", "proof", "project", "campaign"];
const DESCRIBABLE_TYPES = ["task", "proof", "project", "campaign"];
// Reusable schema fragments
const resourceTypeSchema = z
    .enum(RESOURCE_TYPES)
    .describe("The type of item: workrequest, task, proof, project, or campaign.");
const describableTypeSchema = z
    .enum(DESCRIBABLE_TYPES)
    .describe("The type of item. Work requests do not have descriptions.");
const idSchema = z.number().int().describe("The item's unique integer ID.");
const pageSchema = z.number().int().optional().describe("Page number (default: 1).");
const pageSizeSchema = z
    .union([z.literal(10), z.literal(20), z.literal(30)])
    .optional()
    .describe("Number of items per page: 10, 20, or 30.");
const formatSchema = z
    .string()
    .optional()
    .describe("Content format, e.g. 'html' or 'plain'.");
async function lythoFetch(path, options = {}) {
    const token = await getAccessToken();
    const url = `${API_BASE}${path}`;
    const response = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...options.headers,
        },
    });
    if (!response.ok) {
        const body = await response.text().catch(() => "(no response body)");
        throw new Error(`Lytho API ${response.status} ${response.statusText}: ${body}`);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
}
function buildQs(params) {
    const s = params.toString();
    return s ? `?${s}` : "";
}
const server = new McpServer({
    name: "lytho-mcp-server",
    version: "1.0.0",
});
// ── search_items ──────────────────────────────────────────────────────────────
server.registerTool("search_items", {
    description: "Search Lytho items (work requests, tasks, proofs, projects, or campaigns) by name and archived status.",
    inputSchema: {
        type: resourceTypeSchema,
        name: z.string().optional().describe("Filter by name (partial match supported)."),
        isArchived: z.boolean().optional().describe("Filter by archived status. Omit to return all."),
        operatorMode: z
            .number()
            .optional()
            .describe("Search operator: 1 = Or (any filter matches), 2 = And (all filters match)."),
    },
}, async ({ type, name, isArchived, operatorMode }) => {
    const params = new URLSearchParams();
    if (name)
        params.set("name", name);
    if (isArchived !== undefined)
        params.set("isArchived", String(isArchived));
    if (operatorMode !== undefined)
        params.set("operatorMode", String(operatorMode));
    const data = await lythoFetch(`/${type}/search${buildQs(params)}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});
// ── get_item ──────────────────────────────────────────────────────────────────
server.registerTool("get_item", {
    description: "Retrieve a single Lytho item by its ID.",
    inputSchema: {
        type: resourceTypeSchema,
        id: idSchema,
    },
}, async ({ type, id }) => {
    const data = await lythoFetch(`/${type}/${id}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});
// ── list_items ────────────────────────────────────────────────────────────────
server.registerTool("list_items", {
    description: "Retrieve multiple Lytho items by their IDs in a single request. Supports pagination.",
    inputSchema: {
        type: resourceTypeSchema,
        ids: z.array(z.number().int()).describe("List of item IDs to retrieve."),
        page: pageSchema,
        pageSize: pageSizeSchema,
    },
}, async ({ type, ids, page, pageSize }) => {
    const params = new URLSearchParams();
    for (const id of ids)
        params.append("ids", String(id));
    if (page)
        params.set("page", String(page));
    if (pageSize)
        params.set("pageSize", String(pageSize));
    const data = await lythoFetch(`/${type}${buildQs(params)}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});
// ── update_item ───────────────────────────────────────────────────────────────
server.registerTool("update_item", {
    description: "Update a Lytho item using JSON Patch operations (RFC 6902). Use a 'test' operation first to guard against concurrent edits, then 'replace' to change fields.",
    inputSchema: {
        type: resourceTypeSchema,
        id: idSchema,
        operations: z
            .array(z.object({
            op: z.enum(["test", "replace", "add", "remove"]),
            path: z.string().describe("JSON Pointer path, e.g. '/name' or '/dueDate'."),
            value: z.unknown().optional().describe("New value (not needed for 'remove')."),
        }))
            .describe("Array of JSON Patch operations."),
    },
}, async ({ type, id, operations }) => {
    const data = await lythoFetch(`/${type}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json-patch+json" },
        body: JSON.stringify(operations),
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});
// ── get_comments ──────────────────────────────────────────────────────────────
server.registerTool("get_comments", {
    description: "Get paginated comments for any Lytho item.",
    inputSchema: {
        type: resourceTypeSchema,
        id: idSchema,
        format: formatSchema,
        page: pageSchema,
        pageSize: pageSizeSchema,
    },
}, async ({ type, id, format, page, pageSize }) => {
    const params = new URLSearchParams();
    if (format)
        params.set("format", format);
    if (page)
        params.set("page", String(page));
    if (pageSize)
        params.set("pageSize", String(pageSize));
    const data = await lythoFetch(`/${type}/${id}/comments${buildQs(params)}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});
// ── get_files ─────────────────────────────────────────────────────────────────
server.registerTool("get_files", {
    description: "Get downloadable file URLs attached to a Lytho item. Work requests return deliverable file URLs; all other types return general file URLs.",
    inputSchema: {
        type: resourceTypeSchema,
        id: idSchema,
    },
}, async ({ type, id }) => {
    // WorkRequest uses a different path for files
    const filePath = type === "workrequest"
        ? `/${type}/${id}/deliverablefiles/urls`
        : `/${type}/${id}/files/urls`;
    const data = await lythoFetch(filePath);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});
// ── get_users ─────────────────────────────────────────────────────────────────
server.registerTool("get_users", {
    description: "Get the list of users associated with a Lytho item.",
    inputSchema: {
        type: resourceTypeSchema,
        id: idSchema,
    },
}, async ({ type, id }) => {
    const data = await lythoFetch(`/${type}/${id}/users`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});
// ── get_description ───────────────────────────────────────────────────────────
server.registerTool("get_description", {
    description: "Get the rich-text description for a Lytho task, proof, project, or campaign. Not available for work requests.",
    inputSchema: {
        type: describableTypeSchema,
        id: idSchema,
        format: formatSchema,
    },
}, async ({ type, id, format }) => {
    const params = new URLSearchParams();
    if (format)
        params.set("format", format);
    const data = await lythoFetch(`/${type}/${id}/description${buildQs(params)}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});
// ── list_descriptions ─────────────────────────────────────────────────────────
server.registerTool("list_descriptions", {
    description: "Batch-retrieve descriptions for multiple Lytho tasks, proofs, projects, or campaigns. More efficient than calling get_description repeatedly.",
    inputSchema: {
        type: describableTypeSchema,
        ids: z.array(z.number().int()).describe("List of item IDs."),
        format: formatSchema,
        page: pageSchema,
        pageSize: pageSizeSchema,
    },
}, async ({ type, ids, format, page, pageSize }) => {
    const params = new URLSearchParams();
    for (const id of ids)
        params.append("ids", String(id));
    if (format)
        params.set("format", format);
    if (page)
        params.set("page", String(page));
    if (pageSize)
        params.set("pageSize", String(pageSize));
    const data = await lythoFetch(`/${type}/descriptions${buildQs(params)}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});
// ── list_preferences ──────────────────────────────────────────────────────────
server.registerTool("list_preferences", {
    description: "Retrieve Lytho user preferences. Provide a single 'id' for one preference, " +
        "an 'ids' array to batch-fetch multiple preferences, or omit both to list all.",
    inputSchema: {
        id: z.number().int().optional().describe("Single preference ID."),
        ids: z.array(z.number().int()).optional().describe("Multiple preference IDs for batch retrieval."),
        page: pageSchema,
        pageSize: pageSizeSchema,
    },
}, async ({ id, ids, page, pageSize }) => {
    if (id !== undefined) {
        const data = await lythoFetch(`/preference/${id}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
    const params = new URLSearchParams();
    if (ids?.length) {
        for (const pid of ids)
            params.append("ids", String(pid));
    }
    if (page)
        params.set("page", String(page));
    if (pageSize)
        params.set("pageSize", String(pageSize));
    const data = await lythoFetch(`/preference${buildQs(params)}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});
// ── start ─────────────────────────────────────────────────────────────────────
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Lytho MCP server running on stdio");
}
main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map