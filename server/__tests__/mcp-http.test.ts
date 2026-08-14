import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { handleRequest } from "../index";

let server: Server;
let baseUrl: string;
const originalToken = process.env.MCP_BEARER_TOKEN;
const testToken = "field-theory-test-token";

beforeAll(async () => {
  process.env.MCP_BEARER_TOKEN = testToken;
  server = createServer(handleRequest);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  if (originalToken === undefined) delete process.env.MCP_BEARER_TOKEN;
  else process.env.MCP_BEARER_TOKEN = originalToken;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function mcpRequest(body: unknown, token = testToken): Promise<Response> {
  return fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

describe("Streamable HTTP MCP", () => {
  it("rejects requests without the bearer token", async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("serves MCP initialization over authenticated HTTP", async () => {
    const response = await mcpRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "field-theory-test", version: "1.0.0" },
      },
    });
    expect(response.status).toBe(200);
    const responseText = await response.text();
    const dataLine = responseText.split("\n").find((line) => line.startsWith("data: "));
    expect(dataLine).toBeTruthy();
    const payload = JSON.parse(dataLine!.slice("data: ".length)) as {
      result?: { serverInfo?: { name?: string } };
    };
    expect(payload.result?.serverInfo?.name).toBe("field-theory");
  });

  it("does not permit non-POST transports", async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    expect(response.status).toBe(405);
  });
});
