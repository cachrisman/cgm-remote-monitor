/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from "next/server";

import { GET } from "../route";

// Mock the dependencies
jest.mock("@/lib/api/settings", () => ({
  getFilteredSettings: jest.fn(() => ({
    units: "mg/dl",
    timeFormat: 12,
    thresholds: {
      bgHigh: 260,
      bgTargetTop: 180,
      bgTargetBottom: 80,
      bgLow: 55
    },
    enable: ["bgnow", "delta", "direction"],
    alarmTypes: ["predict"]
  })),
  getExtendedSettings: jest.fn(() => ({})),
  getAppInfo: jest.fn(() => ({
    name: "Nightscout",
    version: "15.0.0"
  })),
  isEnabled: jest.fn((feature) => ["careportal", "boluscalc"].includes(feature))
}));

jest.mock("@/lib/api/auth", () => ({
  resolveAuth: jest.fn(() =>
    Promise.resolve({
      authorized: true,
      permissions: ["*:*:read"]
    })
  ),
  checkPermission: jest.fn(() => true),
  getAuthorizationInfo: jest.fn(() => Promise.resolve(null))
}));

describe("GET /api/v1/status", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns a proper status response with all required fields", async () => {
    const request = new NextRequest("http://localhost/api/v1/status");
    const response = await GET(request);

    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    const payload = await response.json();

    // Check required fields from swagger spec
    expect(payload.status).toBe("ok");
    expect(payload.name).toBe("Nightscout");
    expect(payload.version).toBe("15.0.0");
    expect(payload.serverTime).toBeDefined();
    expect(payload.serverTimeEpoch).toBeDefined();
    expect(typeof payload.serverTimeEpoch).toBe("number");
    expect(payload.apiEnabled).toBe(true);
    expect(typeof payload.careportalEnabled).toBe("boolean");
    expect(typeof payload.boluscalcEnabled).toBe("boolean");
    expect(payload.settings).toBeDefined();
    expect(payload.extendedSettings).toBeDefined();
    expect(payload.runtimeState).toBeDefined();
  });

  it("includes settings with correct structure", async () => {
    const request = new NextRequest("http://localhost/api/v1/status");
    const response = await GET(request);
    const payload = await response.json();

    expect(payload.settings.units).toBe("mg/dl");
    expect(payload.settings.timeFormat).toBe(12);
    expect(payload.settings.thresholds).toBeDefined();
    expect(payload.settings.thresholds.bgHigh).toBe(260);
    expect(payload.settings.thresholds.bgLow).toBe(55);
  });

  it("includes serverTime as ISO 8601 string", async () => {
    const request = new NextRequest("http://localhost/api/v1/status");
    const response = await GET(request);
    const payload = await response.json();

    // Should be valid ISO date string
    const date = new Date(payload.serverTime);
    expect(date.toISOString()).toBe(payload.serverTime);
  });

  it("returns 401 when not authorized", async () => {
    // Mock unauthorized
    const { checkPermission } = require("@/lib/api/auth");
    checkPermission.mockReturnValueOnce(false);

    const request = new NextRequest("http://localhost/api/v1/status");
    const response = await GET(request);

    expect(response.status).toBe(401);
  });
});

