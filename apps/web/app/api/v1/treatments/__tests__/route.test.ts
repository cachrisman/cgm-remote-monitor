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

jest.mock("@/lib/api/treatments", () => ({
  findTreatments: jest.fn(() =>
    Promise.resolve([
      {
        _id: "abc123000000000000000001",
        eventType: "Correction Bolus",
        insulin: 2.5,
        created_at: "2023-11-14T22:13:20.000Z",
        notes: "Lunch correction"
      },
      {
        _id: "abc123000000000000000002",
        eventType: "Carb Correction",
        carbs: 30,
        created_at: "2023-11-14T22:18:20.000Z"
      }
    ])
  ),
  saveTreatments: jest.fn((payload) => {
    const treatments = Array.isArray(payload) ? payload : [payload];
    return Promise.resolve(
      treatments.map((t, idx) => ({
        _id: `new-id-${idx}`,
        ...t,
        created_at: t.created_at || new Date().toISOString()
      }))
    );
  }),
  deleteTreatments: jest.fn(() => Promise.resolve({ deletedCount: 3 }))
}));

describe("GET /api/v1/treatments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns treatments with 200 status", async () => {
    const request = new NextRequest("http://localhost/api/v1/treatments");
    const response = await GET(request);

    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(Array.isArray(payload)).toBe(true);
    expect(payload.length).toBe(2);
    expect(payload[0].eventType).toBe("Correction Bolus");
    expect(payload[0].insulin).toBe(2.5);
  });

  it("passes find[insulin] filter parameter", async () => {
    const { findTreatments } = require("@/lib/api/treatments");

    const request = new NextRequest(
      "http://localhost/api/v1/treatments?find[insulin][$gte]=3"
    );
    await GET(request);

    expect(findTreatments).toHaveBeenCalled();
    const searchParams = findTreatments.mock.calls[0][0];
    expect(searchParams.get("find[insulin][$gte]")).toBe("3");
  });

  it("passes find[carbs] filter parameter", async () => {
    const { findTreatments } = require("@/lib/api/treatments");

    const request = new NextRequest(
      "http://localhost/api/v1/treatments?find[carbs][$gte]=100"
    );
    await GET(request);

    const searchParams = findTreatments.mock.calls[0][0];
    expect(searchParams.get("find[carbs][$gte]")).toBe("100");
  });

  it("passes find[eventType] filter parameter", async () => {
    const { findTreatments } = require("@/lib/api/treatments");

    const request = new NextRequest(
      "http://localhost/api/v1/treatments?find[eventType]=Correction+Bolus"
    );
    await GET(request);

    const searchParams = findTreatments.mock.calls[0][0];
    expect(searchParams.get("find[eventType]")).toBe("Correction Bolus");
  });

  it("passes count parameter", async () => {
    const { findTreatments } = require("@/lib/api/treatments");

    const request = new NextRequest(
      "http://localhost/api/v1/treatments?count=10"
    );
    await GET(request);

    const searchParams = findTreatments.mock.calls[0][0];
    expect(searchParams.get("count")).toBe("10");
  });

  it("returns 401 when not authorized to read", async () => {
    const { checkPermission } = require("@/lib/api/auth");
    checkPermission.mockReturnValueOnce(false);

    const request = new NextRequest("http://localhost/api/v1/treatments");
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("returns 400 on error", async () => {
    const { findTreatments } = require("@/lib/api/treatments");
    findTreatments.mockRejectedValueOnce(new Error("Database error"));

    const request = new NextRequest("http://localhost/api/v1/treatments");
    const response = await GET(request);

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("Database error");
  });
});

describe("POST /api/v1/treatments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a single treatment and returns 201", async () => {
    const body = {
      eventType: "Correction Bolus",
      insulin: 3.0,
      created_at: "2023-11-14T22:00:00.000Z",
      notes: "Test bolus"
    };
    const request = new NextRequest("http://localhost/api/v1/treatments", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(Array.isArray(payload)).toBe(true);
    expect(payload[0].insulin).toBe(3.0);
  });

  it("creates multiple treatments from array", async () => {
    const body = [
      { eventType: "Correction Bolus", insulin: 2.0 },
      { eventType: "Carb Correction", carbs: 20 }
    ];
    const request = new NextRequest("http://localhost/api/v1/treatments", {
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

  it("handles carbs treatment", async () => {
    const body = {
      eventType: "Meal Bolus",
      carbs: 45,
      insulin: 4.5,
      glucose: 120,
      glucoseType: "Finger"
    };
    const request = new NextRequest("http://localhost/api/v1/treatments", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload[0].carbs).toBe(45);
    expect(payload[0].glucose).toBe(120);
  });

  it("handles temp basal treatment", async () => {
    const body = {
      eventType: "Temp Basal",
      duration: 30,
      percent: 50
    };
    const request = new NextRequest("http://localhost/api/v1/treatments", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
  });

  it("handles site change treatment", async () => {
    const body = {
      eventType: "Site Change",
      notes: "New Omnipod"
    };
    const request = new NextRequest("http://localhost/api/v1/treatments", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
  });

  it("handles sensor start treatment", async () => {
    const body = {
      eventType: "Sensor Start",
      transmitterId: "8GXXXX",
      sensorCode: "1234"
    };
    const request = new NextRequest("http://localhost/api/v1/treatments", {
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

    const body = { eventType: "Note" };
    const request = new NextRequest("http://localhost/api/v1/treatments", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
  });
});

describe("DELETE /api/v1/treatments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("deletes treatments with find[insulin] parameter", async () => {
    const { deleteTreatments } = require("@/lib/api/treatments");

    const request = new NextRequest(
      "http://localhost/api/v1/treatments?find[insulin][$gte]=3",
      { method: "DELETE" }
    );
    const response = await DELETE(request);

    expect(response.status).toBe(200);
    expect(deleteTreatments).toHaveBeenCalled();

    const searchParams = deleteTreatments.mock.calls[0][0];
    expect(searchParams.get("find[insulin][$gte]")).toBe("3");
  });

  it("deletes treatments with find[eventType] parameter", async () => {
    const { deleteTreatments } = require("@/lib/api/treatments");

    const request = new NextRequest(
      "http://localhost/api/v1/treatments?find[eventType]=Note",
      { method: "DELETE" }
    );
    await DELETE(request);

    const searchParams = deleteTreatments.mock.calls[0][0];
    expect(searchParams.get("find[eventType]")).toBe("Note");
  });

  it("returns deleted count in response", async () => {
    const request = new NextRequest("http://localhost/api/v1/treatments", {
      method: "DELETE"
    });
    const response = await DELETE(request);

    const payload = await response.json();
    expect(payload.deletedCount).toBe(3);
  });

  it("returns 401 when not authorized to delete", async () => {
    const { checkPermission } = require("@/lib/api/auth");
    checkPermission.mockReturnValueOnce(false);

    const request = new NextRequest("http://localhost/api/v1/treatments", {
      method: "DELETE"
    });

    const response = await DELETE(request);

    expect(response.status).toBe(401);
  });
});

