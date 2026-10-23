/**
 * Tests for the service reference-data tools (PRD-20969): board-scoped
 * ticket type/subtype/item lookups, so agents can classify tickets correctly
 * without inspecting existing ones.
 *
 * Every test drives the registered tool handlers against a stub client, so no
 * request ever reaches ConnectWise.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CwManageClient } from "../api-client.js";
import { registerServiceTools } from "../tools/service.js";

type Handler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
}>;

interface RecordedCall {
  method: "GET";
  path: string;
  params?: Record<string, string | number | undefined>;
}

class StubClient {
  calls: RecordedCall[] = [];
  getResponse: unknown = [];

  async get(path: string, params: Record<string, string | number | undefined> = {}) {
    this.calls.push({ method: "GET", path, params });
    return this.getResponse;
  }
}

function setup() {
  const tools = new Map<string, { schema: z.ZodRawShape; handler: Handler }>();
  const server = {
    tool(name: string, _description: string, schema: z.ZodRawShape, handler: Handler) {
      tools.set(name, { schema, handler });
    },
  };
  const client = new StubClient();

  registerServiceTools(server as unknown as McpServer, client as unknown as CwManageClient);

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const tool = tools.get(name);
    if (!tool) throw new Error(`tool not registered: ${name}`);
    const result = await tool.handler(args);
    return JSON.parse(result.content[0].text);
  };

  const schemaOf = (name: string) => {
    const tool = tools.get(name);
    if (!tool) throw new Error(`tool not registered: ${name}`);
    return z.object(tool.schema);
  };

  return { tools, client, call, schemaOf };
}

describe("cw_list_ticket_types", () => {
  it("registers the tool", () => {
    const { tools } = setup();
    expect(tools.has("cw_list_ticket_types")).toBe(true);
  });

  // TC1: no boardId must be rejected before any HTTP call.
  it("schema requires boardId", () => {
    const { schemaOf } = setup();
    const result = schemaOf("cw_list_ticket_types").safeParse({});
    expect(result.success).toBe(false);
  });

  // TC2: a boardId issues GET /service/boards/{boardId}/types with paging/conditions.
  it("calls GET /service/boards/:id/types", async () => {
    const { client, call } = setup();
    client.getResponse = [{ id: 1, name: "Alert", inactiveFlag: false }];

    await call("cw_list_ticket_types", { boardId: 7, conditions: "inactiveFlag = false" });

    expect(client.calls[0]).toMatchObject({
      method: "GET",
      path: "/service/boards/7/types",
      params: { conditions: "inactiveFlag = false", page: 1, pageSize: 25 },
    });
  });

  it("defaults paging when not supplied", async () => {
    const { client, call } = setup();
    await call("cw_list_ticket_types", { boardId: 7 });
    expect(client.calls[0].params).toMatchObject({ page: 1, pageSize: 25 });
  });
});

describe("cw_list_ticket_subtypes", () => {
  // TC3: no boardId must be rejected before any HTTP call.
  it("schema requires boardId", () => {
    const { schemaOf } = setup();
    const result = schemaOf("cw_list_ticket_subtypes").safeParse({});
    expect(result.success).toBe(false);
  });

  // TC4: a boardId issues GET /service/boards/{boardId}/subtypes.
  it("calls GET /service/boards/:id/subtypes", async () => {
    const { client, call } = setup();
    client.getResponse = [{ id: 4, name: "Hardware", inactiveFlag: false }];

    await call("cw_list_ticket_subtypes", { boardId: 7 });

    expect(client.calls[0]).toMatchObject({
      method: "GET",
      path: "/service/boards/7/subtypes",
      params: { page: 1, pageSize: 25 },
    });
  });
});

describe("cw_list_ticket_items", () => {
  // TC5: no boardId must be rejected before any HTTP call.
  it("schema requires boardId", () => {
    const { schemaOf } = setup();
    const result = schemaOf("cw_list_ticket_items").safeParse({});
    expect(result.success).toBe(false);
  });

  // TC6: a boardId issues GET /service/boards/{boardId}/items.
  it("calls GET /service/boards/:id/items", async () => {
    const { client, call } = setup();
    client.getResponse = [{ id: 9, name: "Laptop", inactiveFlag: false }];

    await call("cw_list_ticket_items", { boardId: 7 });

    expect(client.calls[0]).toMatchObject({
      method: "GET",
      path: "/service/boards/7/items",
      params: { page: 1, pageSize: 25 },
    });
  });
});

// TC15: schema rejection happens for all three before any HTTP request.
describe("board-scoped lookups reject before any HTTP call when boardId is missing", () => {
  it("cw_list_ticket_types / cw_list_ticket_subtypes / cw_list_ticket_items", () => {
    const { schemaOf } = setup();
    for (const name of ["cw_list_ticket_types", "cw_list_ticket_subtypes", "cw_list_ticket_items"]) {
      expect(schemaOf(name).safeParse({}).success).toBe(false);
    }
  });
});
