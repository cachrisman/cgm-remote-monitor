/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

import { GET } from "../route";

// Mock dependencies
jest.mock("@/lib/api/auth", () => ({
  resolveAuth: jest.fn(() =>
    Promise.resolve({
      authorized: true,
      permissions: ["*"]
    })
  )
}));

jest.mock("@/lib/api/settings", () => ({
  getAppInfo: jest.fn(() => ({
    version: "15.0.0",
    name: "Nightscout"
  }))
}));

describe("GET /api/v3/status", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns version and API info when authorized", async () => {
    const request = new NextRequest("http://localhost/api/v3/status");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.status).toBe(200);
    expect(payload.result).toBeDefined();
    expect(payload.result.version).toBe("15.0.0");
    expect(payload.result.apiVersion).toBe("3.0.4");
    expect(payload.result.srvDate).toBeDefined();
    expect(typeof payload.result.srvDate).toBe("number");
  });

  it("returns storage type info", async () => {
    const request = new NextRequest("http://localhost/api/v3/status");
    const response = await GET(request);

    const payload = await response.json();
    expect(payload.result.storage).toBeDefined();
    expect(payload.result.storage.type).toBe("mongodb");
  });

  it("includes apiPermissions in response", async () => {
    const request = new NextRequest("http://localhost/api/v3/status");
    const response = await GET(request);

    const payload = await response.json();
    expect(payload.result.apiPermissions).toBeDefined();
    expect(Array.isArray(payload.result.apiPermissions)).toBe(true);
    expect(payload.result.apiPermissions).toContain("*");
  });

  it("returns 401 when not authorized", async () => {
    const { resolveAuth } = require("@/lib/api/auth");
    resolveAuth.mockResolvedValueOnce({
      authorized: false,
      permissions: []
    });

    const request = new NextRequest("http://localhost/api/v3/status");
    const response = await GET(request);

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.status).toBe(401);
    expect(payload.message).toBe("Unauthorized");
  });

  it("returns current server timestamp", async () => {
    const expectedTime = new Date("2025-01-01T00:00:00.000Z").getTime();

    const request = new NextRequest("http://localhost/api/v3/status");
    const response = await GET(request);

    const payload = await response.json();
    expect(payload.result.srvDate).toBe(expectedTime);
  });

  it("returns specific user permissions when authenticated with token", async () => {
    const { resolveAuth } = require("@/lib/api/auth");
    resolveAuth.mockResolvedValueOnce({
      authorized: true,
      permissions: ["api:entries:read", "api:treatments:read"]
    });

    const request = new NextRequest("http://localhost/api/v3/status");
    const response = await GET(request);

    const payload = await response.json();
    expect(payload.result.apiPermissions).toEqual([
      "api:entries:read",
      "api:treatments:read"
    ]);
  });

  it("handles internal errors gracefully", async () => {
    const { resolveAuth } = require("@/lib/api/auth");
    resolveAuth.mockRejectedValueOnce(new Error("Database connection failed"));

    const request = new NextRequest("http://localhost/api/v3/status");
    const response = await GET(request);

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.status).toBe(500);
    expect(payload.message).toBe("Database connection failed");
  });
});

