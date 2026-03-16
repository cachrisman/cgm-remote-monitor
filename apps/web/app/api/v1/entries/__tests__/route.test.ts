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

jest.mock("@/lib/api/entries", () => ({
  findEntries: jest.fn(() =>
    Promise.resolve([
      {
        _id: "abc123000000000000000001",
        type: "sgv",
        sgv: 110,
        date: 1700000000000,
        dateString: "2023-11-14T22:13:20.000Z",
        direction: "Flat"
      },
      {
        _id: "abc123000000000000000002",
        type: "sgv",
        sgv: 115,
        date: 1700000300000,
        dateString: "2023-11-14T22:18:20.000Z",
        direction: "FortyFiveUp"
      }
    ])
  ),
  saveEntries: jest.fn((payload) => {
    const entries = Array.isArray(payload) ? payload : [payload];
    return Promise.resolve(
      entries.map((e, idx) => ({
        _id: `new-id-${idx}`,
        ...e,
        date: e.date || Date.now(),
        dateString: new Date(e.date || Date.now()).toISOString()
      }))
    );
  }),
  deleteEntries: jest.fn(() => Promise.resolve({ deletedCount: 5 }))
}));

describe("GET /api/v1/entries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns entries with 200 status", async () => {
    const request = new NextRequest("http://localhost/api/v1/entries");
    const response = await GET(request);

    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(Array.isArray(payload)).toBe(true);
    expect(payload.length).toBe(2);
    expect(payload[0].sgv).toBe(110);
    expect(payload[0].type).toBe("sgv");
  });

  it("passes find parameters to findEntries", async () => {
    const { findEntries } = require("@/lib/api/entries");

    const request = new NextRequest(
      "http://localhost/api/v1/entries?find[sgv][$gte]=100"
    );
    await GET(request);

    expect(findEntries).toHaveBeenCalled();
    const searchParams = findEntries.mock.calls[0][0];
    expect(searchParams.get("find[sgv][$gte]")).toBe("100");
  });

  it("passes count parameter to findEntries", async () => {
    const { findEntries } = require("@/lib/api/entries");

    const request = new NextRequest(
      "http://localhost/api/v1/entries?count=5"
    );
    await GET(request);

    expect(findEntries).toHaveBeenCalled();
    const searchParams = findEntries.mock.calls[0][0];
    expect(searchParams.get("count")).toBe("5");
  });

  it("passes date filter parameters", async () => {
    const { findEntries } = require("@/lib/api/entries");

    const request = new NextRequest(
      "http://localhost/api/v1/entries?find[dateString][$gte]=2023-11-01"
    );
    await GET(request);

    expect(findEntries).toHaveBeenCalled();
    const searchParams = findEntries.mock.calls[0][0];
    expect(searchParams.get("find[dateString][$gte]")).toBe("2023-11-01");
  });

  it("returns 401 when not authorized to read", async () => {
    const { checkPermission } = require("@/lib/api/auth");
    checkPermission.mockReturnValueOnce(false);

    const request = new NextRequest("http://localhost/api/v1/entries");
    const response = await GET(request);

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.message).toBe("Unauthorized");
  });

  it("returns 400 on error", async () => {
    const { findEntries } = require("@/lib/api/entries");
    findEntries.mockRejectedValueOnce(new Error("Database error"));

    const request = new NextRequest("http://localhost/api/v1/entries");
    const response = await GET(request);

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("Database error");
  });
});

describe("POST /api/v1/entries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a single entry and returns 201", async () => {
    const body = {
      type: "sgv",
      sgv: 120,
      date: 1700000001000,
      direction: "Flat"
    };
    const request = new NextRequest("http://localhost/api/v1/entries", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(Array.isArray(payload)).toBe(true);
    expect(payload[0].sgv).toBe(120);
  });

  it("creates multiple entries from array", async () => {
    const body = [
      { type: "sgv", sgv: 120, date: 1700000001000 },
      { type: "sgv", sgv: 125, date: 1700000002000 }
    ];
    const request = new NextRequest("http://localhost/api/v1/entries", {
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

  it("returns 401 when not authorized to create", async () => {
    const { checkPermission } = require("@/lib/api/auth");
    checkPermission.mockReturnValueOnce(false);

    const body = { type: "sgv", sgv: 120 };
    const request = new NextRequest("http://localhost/api/v1/entries", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it("handles mbg entry type", async () => {
    const body = { type: "mbg", mbg: 100, date: 1700000001000 };
    const request = new NextRequest("http://localhost/api/v1/entries", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload[0].type).toBe("mbg");
    expect(payload[0].mbg).toBe(100);
  });

  it("handles cal entry type", async () => {
    const body = { type: "cal", slope: 1000, intercept: 100, scale: 1 };
    const request = new NextRequest("http://localhost/api/v1/entries", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
  });
});

describe("DELETE /api/v1/entries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("deletes entries with find parameters", async () => {
    const { deleteEntries } = require("@/lib/api/entries");

    const request = new NextRequest(
      "http://localhost/api/v1/entries?find[type]=sgv",
      { method: "DELETE" }
    );
    const response = await DELETE(request);

    expect(response.status).toBe(200);
    expect(deleteEntries).toHaveBeenCalled();

    const payload = await response.json();
    expect(payload.deletedCount).toBe(5);
  });

  it("passes count parameter to limit deletion", async () => {
    const { deleteEntries } = require("@/lib/api/entries");

    const request = new NextRequest(
      "http://localhost/api/v1/entries?count=10",
      { method: "DELETE" }
    );
    await DELETE(request);

    const searchParams = deleteEntries.mock.calls[0][0];
    expect(searchParams.get("count")).toBe("10");
  });

  it("returns 401 when not authorized to delete", async () => {
    const { checkPermission } = require("@/lib/api/auth");
    checkPermission.mockReturnValueOnce(false);

    const request = new NextRequest("http://localhost/api/v1/entries", {
      method: "DELETE"
    });

    const response = await DELETE(request);

    expect(response.status).toBe(401);
  });
});

