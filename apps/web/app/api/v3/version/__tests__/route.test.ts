/**
 * @jest-environment node
 */

import { NextResponse } from "next/server";

import { GET } from "../route";

// Mock the settings module
jest.mock("@/lib/api/settings", () => ({
  getAppInfo: jest.fn(() => ({
    name: "Nightscout",
    version: "15.0.0"
  }))
}));

describe("GET /api/v3/version", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns version information", async () => {
    const response = await GET();

    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    const payload = await response.json();

    expect(payload.status).toBe(200);
    expect(payload.result).toBeDefined();
    expect(payload.result.version).toBe("15.0.0");
    expect(payload.result.apiVersion).toBe("3.0.4");
    expect(typeof payload.result.srvDate).toBe("number");
    expect(payload.result.storage).toBeDefined();
    expect(payload.result.storage.type).toBe("mongodb");
  });

  it("returns srvDate as Unix timestamp in milliseconds", async () => {
    const before = Date.now();
    const response = await GET();
    const after = Date.now();

    const payload = await response.json();

    expect(payload.result.srvDate).toBeGreaterThanOrEqual(before);
    expect(payload.result.srvDate).toBeLessThanOrEqual(after);
  });

  it("does not require authentication", async () => {
    // This endpoint should work without any auth
    const response = await GET();
    expect(response.status).toBe(200);
  });
});

