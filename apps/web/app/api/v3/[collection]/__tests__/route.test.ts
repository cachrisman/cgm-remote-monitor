/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from "next/server";

import { GET, POST } from "../route";

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

jest.mock("@/lib/api/collections", () => ({
  getEntriesCollection: jest.fn(() =>
    Promise.resolve({
      find: jest.fn(() => ({
        sort: jest.fn(() => ({
          skip: jest.fn(() => ({
            limit: jest.fn(() => ({
              project: jest.fn(() => ({
                toArray: jest.fn(() =>
                  Promise.resolve([
                    {
                      _id: "abc123",
                      identifier: "entry-1",
                      sgv: 110,
                      date: 1700000000000,
                      direction: "Flat"
                    }
                  ])
                )
              })),
              toArray: jest.fn(() =>
                Promise.resolve([
                  {
                    _id: "abc123",
                    identifier: "entry-1",
                    sgv: 110,
                    date: 1700000000000,
                    direction: "Flat"
                  }
                ])
              )
            }))
          }))
        }))
      }))
    })
  ),
  getTreatmentsCollection: jest.fn(),
  getDeviceStatusCollection: jest.fn(),
  getProfileCollection: jest.fn(),
  getFoodCollection: jest.fn(),
  getSettingsCollection: jest.fn()
}));

jest.mock("@/lib/api/v3-documents", () => ({
  upsertV3Document: jest.fn(() =>
    Promise.resolve({
      _id: "new-id",
      identifier: "new-entry",
      sgv: 120,
      date: 1700000001000,
      srvCreated: 1700000001000,
      srvModified: 1700000001000
    })
  ),
  normalizeV3Document: jest.fn((doc) => ({
    ...doc,
    srvModified: Date.now()
  }))
}));

jest.mock("@/lib/api/serialization", () => ({
  serializeDocument: jest.fn((doc) => ({
    ...doc,
    _id: String(doc._id)
  })),
  serializeDocuments: jest.fn((docs) =>
    docs.map((doc: Record<string, unknown>) => ({
      ...doc,
      _id: String(doc._id)
    }))
  )
}));

jest.mock("@/lib/api/v3-query", () => ({
  parseV3Query: jest.fn(() => ({
    filter: {},
    sort: { date: -1 },
    limit: 10,
    skip: 0
  })),
  buildProjection: jest.fn()
}));

describe("V3 Collection Routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/v3/:collection (SEARCH)", () => {
    it("returns documents from entries collection", async () => {
      const request = new NextRequest("http://localhost/api/v3/entries");
      const response = await GET(request, {
        params: Promise.resolve({ collection: "entries" })
      });

      expect(response).toBeInstanceOf(NextResponse);
      expect(response.status).toBe(200);

      const payload = await response.json();

      expect(payload.status).toBe(200);
      expect(payload.result).toBeDefined();
      expect(Array.isArray(payload.result)).toBe(true);
      expect(payload.result.length).toBe(1);
      expect(payload.result[0].sgv).toBe(110);
    });

    it("returns 404 for invalid collection", async () => {
      const request = new NextRequest("http://localhost/api/v3/invalid");
      const response = await GET(request, {
        params: Promise.resolve({ collection: "invalid" })
      });

      expect(response.status).toBe(404);

      const payload = await response.json();
      expect(payload.status).toBe(404);
      expect(payload.message).toBe("Not Found");
    });

    it("returns 401 when not authorized", async () => {
      const { checkPermission } = require("@/lib/api/auth");
      const { resolveAuth } = require("@/lib/api/auth");
      checkPermission.mockReturnValueOnce(false);
      resolveAuth.mockResolvedValueOnce({
        authorized: false,
        permissions: []
      });

      const request = new NextRequest("http://localhost/api/v3/entries");
      const response = await GET(request, {
        params: Promise.resolve({ collection: "entries" })
      });

      expect(response.status).toBe(401);
    });

    it("returns 403 when authorized but missing permission", async () => {
      const { checkPermission } = require("@/lib/api/auth");
      const { resolveAuth } = require("@/lib/api/auth");
      checkPermission.mockReturnValueOnce(false);
      resolveAuth.mockResolvedValueOnce({
        authorized: true,
        permissions: ["api:treatments:read"]
      });

      const request = new NextRequest("http://localhost/api/v3/entries");
      const response = await GET(request, {
        params: Promise.resolve({ collection: "entries" })
      });

      expect(response.status).toBe(403);
    });
  });

  describe("POST /api/v3/:collection (CREATE)", () => {
    it("creates a new document", async () => {
      const body = { sgv: 120, date: 1700000001000, type: "sgv" };
      const request = new NextRequest("http://localhost/api/v3/entries", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" }
      });

      const response = await POST(request, {
        params: Promise.resolve({ collection: "entries" })
      });

      expect(response.status).toBe(201);

      const payload = await response.json();
      expect(payload.status).toBe(201);
      expect(payload.result).toBeDefined();
      expect(payload.lastModified).toBeDefined();
    });

    it("creates multiple documents from array", async () => {
      const body = [
        { sgv: 120, date: 1700000001000 },
        { sgv: 125, date: 1700000002000 }
      ];
      const request = new NextRequest("http://localhost/api/v3/entries", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" }
      });

      const response = await POST(request, {
        params: Promise.resolve({ collection: "entries" })
      });

      expect(response.status).toBe(201);

      const payload = await response.json();
      expect(Array.isArray(payload.result)).toBe(true);
    });

    it("returns 404 for invalid collection", async () => {
      const request = new NextRequest("http://localhost/api/v3/invalid", {
        method: "POST",
        body: JSON.stringify({ test: true }),
        headers: { "Content-Type": "application/json" }
      });

      const response = await POST(request, {
        params: Promise.resolve({ collection: "invalid" })
      });

      expect(response.status).toBe(404);
    });
  });
});

