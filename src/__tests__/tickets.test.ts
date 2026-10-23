/**
 * Tests for cw_create_ticket's itemId field (PRD-20969 AC4): closes the one
 * classification field that previously had no write path at all.
 *
 * Drives the registered tool handler against a stub client, so no request
 * ever reaches ConnectWise.
 */

import { describe, it, expect } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CwManageClient } from "../api-client.js";
import { registerTicketTools } from "../tools/tickets.js";

type Handler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
}>;

interface RecordedCall {
  method: "GET" | "POST" | "PATCH";
  path: string;
  body?: unknown;
}

class StubClient {
  calls: RecordedCall[] = [];
  postResponse: unknown = { id: 1 };

  async get(path: string) {
    this.calls.push({ method: "GET", path });
    return {};
  }

  async post(path: string, body: unknown) {
    this.calls.push({ method: "POST", path, body });
    return this.postResponse;
  }

  async patch(path: string, body: unknown) {
    this.calls.push({ method: "PATCH", path, body });
    return { id: 1 };
  }
}

function setup() {
  const tools = new Map<string, { description: string; handler: Handler }>();
  const server = {
    tool(name: string, description: string, _schema: unknown, handler: Handler) {
      tools.set(name, { description, handler });
    },
    registerTool(
      name: string,
      config: { description: string },
      handler: Handler,
    ) {
      tools.set(name, { description: config.description, handler });
    },
  };
  const client = new StubClient();

  registerTicketTools(server as unknown as McpServer, client as unknown as CwManageClient);

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const tool = tools.get(name);
    if (!tool) throw new Error(`tool not registered: ${name}`);
    const result = await tool.handler(args);
    return JSON.parse(result.content[0].text);
  };

  return { tools, client, call };
}

describe("cw_create_ticket", () => {
  // TC7: itemId is forwarded as body.item.id alongside type/subType.
  it("forwards itemId as body.item.id alongside type/subType", async () => {
    const { client, call } = setup();

    await call("cw_create_ticket", {
      summary: "Remove CW access",
      boardId: 7,
      typeId: 1,
      subTypeId: 4,
      itemId: 9,
    });

    expect(client.calls[0]).toMatchObject({
      method: "POST",
      path: "/service/tickets",
      body: {
        summary: "Remove CW access",
        board: { id: 7 },
        type: { id: 1 },
        subType: { id: 4 },
        item: { id: 9 },
      },
    });
  });

  it("omits item when itemId is not supplied (no regression)", async () => {
    const { client, call } = setup();

    await call("cw_create_ticket", { summary: "No item" });

    expect(client.calls[0].body).not.toHaveProperty("item");
  });
});

describe("cw_update_ticket", () => {
  it("documents item/id as an example JSON Patch path", () => {
    const { tools } = setup();
    expect(tools.get("cw_update_ticket")!.description).toMatch(/item\/id/);
  });
});
