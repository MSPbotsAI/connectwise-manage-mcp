/**
 * Tests for the time-entry billing/classification additions (PRD-20969):
 * cw_list_work_types / cw_list_work_roles lookups, and the four new
 * cw_create_time_entry fields (billableOption, addToDetailDescriptionFlag,
 * addToInternalAnalysisFlag, addToResolutionFlag).
 *
 * Drives the registered tool handlers against a stub client, so no request
 * ever reaches ConnectWise.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CwManageClient } from "../api-client.js";
import { registerTimeEntryTools } from "../tools/time-entries.js";

type Handler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
}>;

interface RecordedCall {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  params?: Record<string, string | number | undefined>;
  body?: unknown;
}

class StubClient {
  calls: RecordedCall[] = [];
  getResponse: unknown = [];
  postResponse: unknown = { id: 1 };

  async get(path: string, params: Record<string, string | number | undefined> = {}) {
    this.calls.push({ method: "GET", path, params });
    return this.getResponse;
  }

  async post(path: string, body: unknown) {
    this.calls.push({ method: "POST", path, body });
    return this.postResponse;
  }

  async patch(path: string, body: unknown) {
    this.calls.push({ method: "PATCH", path, body });
    return { id: 1 };
  }

  async delete(path: string) {
    this.calls.push({ method: "DELETE", path });
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

  registerTimeEntryTools(server as unknown as McpServer, client as unknown as CwManageClient);

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

const BASE_ARGS = {
  chargeToType: "ServiceTicket" as const,
  chargeToId: 55123,
  memberId: 42,
  timeStart: "2026-10-21T09:00:00Z",
};

// TC9: no input required; issues GET /time/workTypes and GET /time/workRoles.
describe("cw_list_work_types", () => {
  it("calls GET /time/workTypes with no required parameters", async () => {
    const { client, call } = setup();
    client.getResponse = [{ id: 12, name: "Standard", inactiveFlag: false }];

    await call("cw_list_work_types", {});

    expect(client.calls[0]).toMatchObject({
      method: "GET",
      path: "/time/workTypes",
      params: { page: 1, pageSize: 25 },
    });
  });
});

describe("cw_list_work_roles", () => {
  it("calls GET /time/workRoles with no required parameters", async () => {
    const { client, call } = setup();
    client.getResponse = [{ id: 3, name: "Engineer", inactiveFlag: false }];

    await call("cw_list_work_roles", {});

    expect(client.calls[0]).toMatchObject({
      method: "GET",
      path: "/time/workRoles",
      params: { page: 1, pageSize: 25 },
    });
  });
});

describe("cw_create_time_entry", () => {
  // TC10: workTypeId/workRoleId still forward unchanged (regression guard).
  it("still forwards workTypeId/workRoleId unchanged", async () => {
    const { client, call } = setup();

    await call("cw_create_time_entry", { ...BASE_ARGS, workTypeId: 12, workRoleId: 3 });

    expect(client.calls[0]).toMatchObject({
      method: "POST",
      path: "/time/entries",
      body: {
        workType: { id: 12 },
        workRole: { id: 3 },
      },
    });
  });

  // TC11: billableOption forwards verbatim when valid; schema rejects invalid values.
  it("forwards a valid billableOption", async () => {
    const { client, call } = setup();

    await call("cw_create_time_entry", { ...BASE_ARGS, billableOption: "Billable" });

    expect(client.calls[0].body).toMatchObject({ billableOption: "Billable" });
  });

  it("schema rejects an invalid billableOption", () => {
    const { schemaOf } = setup();
    const result = schemaOf("cw_create_time_entry").safeParse({
      ...BASE_ARGS,
      billableOption: "NotARealOption",
    });
    expect(result.success).toBe(false);
  });

  // TC12: only the addTo*Flag fields explicitly set are forwarded.
  it("forwards only the addTo*Flag fields that were set", async () => {
    const { client, call } = setup();

    await call("cw_create_time_entry", {
      ...BASE_ARGS,
      addToResolutionFlag: true,
    });

    expect(client.calls[0].body).toMatchObject({ addToResolutionFlag: true });
    expect(client.calls[0].body).not.toHaveProperty("addToDetailDescriptionFlag");
    expect(client.calls[0].body).not.toHaveProperty("addToInternalAnalysisFlag");
  });

  it("forwards multiple addTo*Flag fields at once", async () => {
    const { client, call } = setup();

    await call("cw_create_time_entry", {
      ...BASE_ARGS,
      addToDetailDescriptionFlag: true,
      addToInternalAnalysisFlag: false,
      addToResolutionFlag: true,
    });

    expect(client.calls[0].body).toMatchObject({
      addToDetailDescriptionFlag: true,
      addToInternalAnalysisFlag: false,
      addToResolutionFlag: true,
    });
  });

  // TC14: byte-identical body when none of the new fields are supplied (regression).
  it("body is unchanged when no new fields are supplied", async () => {
    const { client, call } = setup();

    await call("cw_create_time_entry", BASE_ARGS);

    expect(client.calls[0].body).toEqual({
      chargeToType: "ServiceTicket",
      chargeToId: 55123,
      member: { id: 42 },
      timeStart: "2026-10-21T09:00:00Z",
    });
  });
});
