/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from "next/server";

import { GET, POST, DELETE } from "../route";

// Mock dependencies
jest.mock("@/lib/api/auth", () => ({
  resolveAuth: jest.fn(() =>
    Promise.resolve({
      authorized: true,
      permissions: ["*"]
    })
  ),
  checkPermission: jest.fn(() => true)
}));

jest.mock("@/lib/api/devicestatus", () => ({
  findDeviceStatuses: jest.fn(() =>
    Promise.resolve([
      {
        _id: "abc123000000000000000001",
        device: "openaps://hostname",
        created_at: "2023-11-14T22:13:20.000Z",
        uploader: { battery: 85 },
        pump: { battery: { percent: 50 }, reservoir: 150 }
      },
      {
        _id: "abc123000000000000000002",
        device: "loop://iPhone",
        created_at: "2023-11-14T22:18:20.000Z",
        uploader: { battery: 90 }
      }
    ])
  ),
  saveDeviceStatuses: jest.fn((payload) => {
    const statuses = Array.isArray(payload) ? payload : [payload];
    return Promise.resolve(
      statuses.map((s, idx) => ({
        _id: `new-id-${idx}`,
        ...s,
        created_at: s.created_at || new Date().toISOString()
      }))
    );
  }),
  deleteDeviceStatuses: jest.fn(() => Promise.resolve({ deletedCount: 2 }))
}));

describe("GET /api/v1/devicestatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns devicestatus records with 200 status", async () => {
    const request = new NextRequest("http://localhost/api/v1/devicestatus");
    const response = await GET(request);

    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(Array.isArray(payload)).toBe(true);
    expect(payload.length).toBe(2);
    expect(payload[0].device).toBe("openaps://hostname");
  });

  it("passes find[dateString] filter parameter", async () => {
    const { findDeviceStatuses } = require("@/lib/api/devicestatus");

    const request = new NextRequest(
      "http://localhost/api/v1/devicestatus?find[dateString][$gte]=2023-11-01"
    );
    await GET(request);

    expect(findDeviceStatuses).toHaveBeenCalled();
    const searchParams = findDeviceStatuses.mock.calls[0][0];
    expect(searchParams.get("find[dateString][$gte]")).toBe("2023-11-01");
  });

  it("passes find[created_at] filter parameter", async () => {
    const { findDeviceStatuses } = require("@/lib/api/devicestatus");

    const request = new NextRequest(
      "http://localhost/api/v1/devicestatus?find[created_at][$gte]=2023-11-01"
    );
    await GET(request);

    const searchParams = findDeviceStatuses.mock.calls[0][0];
    expect(searchParams.get("find[created_at][$gte]")).toBe("2023-11-01");
  });

  it("passes count parameter", async () => {
    const { findDeviceStatuses } = require("@/lib/api/devicestatus");

    const request = new NextRequest(
      "http://localhost/api/v1/devicestatus?count=10"
    );
    await GET(request);

    const searchParams = findDeviceStatuses.mock.calls[0][0];
    expect(searchParams.get("count")).toBe("10");
  });

  it("returns 401 when not authorized to read", async () => {
    const { checkPermission } = require("@/lib/api/auth");
    checkPermission.mockReturnValueOnce(false);

    const request = new NextRequest("http://localhost/api/v1/devicestatus");
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("returns 400 on error", async () => {
    const { findDeviceStatuses } = require("@/lib/api/devicestatus");
    findDeviceStatuses.mockRejectedValueOnce(new Error("Database error"));

    const request = new NextRequest("http://localhost/api/v1/devicestatus");
    const response = await GET(request);

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("Database error");
  });
});

describe("POST /api/v1/devicestatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a single devicestatus and returns 201", async () => {
    const body = {
      device: "openaps://test",
      created_at: "2023-11-14T22:00:00.000Z",
      uploader: { battery: 80 }
    };
    const request = new NextRequest("http://localhost/api/v1/devicestatus", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(Array.isArray(payload)).toBe(true);
    expect(payload[0].device).toBe("openaps://test");
  });

  it("creates multiple devicestatus records from array", async () => {
    const body = [
      { device: "openaps://test1", uploader: { battery: 80 } },
      { device: "loop://test2", uploader: { battery: 90 } }
    ];
    const request = new NextRequest("http://localhost/api/v1/devicestatus", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(Array.isArray(payload)).toBe(true);
    expect(payload.length).toBe(2);
  });

  it("handles openaps devicestatus", async () => {
    const body = {
      device: "openaps://hostname",
      openaps: {
        enacted: { reason: "test" },
        suggested: {}
      }
    };
    const request = new NextRequest("http://localhost/api/v1/devicestatus", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
  });

  it("handles loop devicestatus", async () => {
    const body = {
      device: "loop://iPhone",
      loop: {
        enacted: { received: true },
        failureReason: null
      }
    };
    const request = new NextRequest("http://localhost/api/v1/devicestatus", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
  });

  it("handles pump status data", async () => {
    const body = {
      device: "pump://medtronic",
      pump: {
        clock: "2023-11-14T22:00:00.000Z",
        battery: { status: "normal", voltage: 1.45 },
        reservoir: 150,
        status: { status: "normal", bolusing: false, suspended: false }
      }
    };
    const request = new NextRequest("http://localhost/api/v1/devicestatus", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
  });

  it("handles xdripjs devicestatus", async () => {
    const body = {
      device: "xdripjs://hostname",
      xdripjs: {
        state: 6,
        stateString: "OK",
        txId: "8GXXXX",
        txStatus: 0
      }
    };
    const request = new NextRequest("http://localhost/api/v1/devicestatus", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
  });

  it("returns 401 when not authorized to create", async () => {
    const { checkPermission } = require("@/lib/api/auth");
    checkPermission.mockReturnValueOnce(false);

    const body = { device: "test" };
    const request = new NextRequest("http://localhost/api/v1/devicestatus", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
  });
});

describe("DELETE /api/v1/devicestatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("deletes devicestatus with find[created_at] parameter", async () => {
    const { deleteDeviceStatuses } = require("@/lib/api/devicestatus");

    const request = new NextRequest(
      "http://localhost/api/v1/devicestatus?find[created_at][$lte]=2023-11-01",
      { method: "DELETE" }
    );
    const response = await DELETE(request);

    expect(response.status).toBe(200);
    expect(deleteDeviceStatuses).toHaveBeenCalled();

    const searchParams = deleteDeviceStatuses.mock.calls[0][0];
    expect(searchParams.get("find[created_at][$lte]")).toBe("2023-11-01");
  });

  it("returns deleted count in response", async () => {
    const request = new NextRequest("http://localhost/api/v1/devicestatus", {
      method: "DELETE"
    });
    const response = await DELETE(request);

    const payload = await response.json();
    expect(payload.deletedCount).toBe(2);
  });

  it("returns 401 when not authorized to delete", async () => {
    const { checkPermission } = require("@/lib/api/auth");
    checkPermission.mockReturnValueOnce(false);

    const request = new NextRequest("http://localhost/api/v1/devicestatus", {
      method: "DELETE"
    });

    const response = await DELETE(request);

    expect(response.status).toBe(401);
  });
});

