/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from "next/server";

import { GET } from "../route";

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

const mockFind = jest.fn();
const mockSort = jest.fn();
const mockSkip = jest.fn();
const mockLimit = jest.fn();
const mockProject = jest.fn();
const mockToArray = jest.fn();

jest.mock("@/lib/api/collections", () => ({
  getEntriesCollection: jest.fn(() =>
    Promise.resolve({
      find: mockFind
    })
  ),
  getTreatmentsCollection: jest.fn(() =>
    Promise.resolve({
      find: mockFind
    })
  ),
  getDeviceStatusCollection: jest.fn(() =>
    Promise.resolve({
      find: mockFind
    })
  ),
  getProfileCollection: jest.fn(() =>
    Promise.resolve({
      find: mockFind
    })
  ),
  getFoodCollection: jest.fn(() =>
    Promise.resolve({
      find: mockFind
    })
  ),
  getSettingsCollection: jest.fn(() =>
    Promise.resolve({
      find: mockFind
    })
  )
}));

jest.mock("@/lib/api/serialization", () => ({
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
    sort: { srvModified: 1 },
    limit: 1000,
    skip: 0,
    fields: "_all"
  })),
  buildProjection: jest.fn()
}));

describe("GET /api/v3/:collection/history (HISTORY)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup chain mocks
    mockToArray.mockResolvedValue([
      {
        _id: "abc123",
        identifier: "entry-1",
        sgv: 110,
        srvModified: 1700000001000
      },
      {
        _id: "def456",
        identifier: "entry-2",
        sgv: 115,
        srvModified: 1700000002000
      }
    ]);
    
    mockProject.mockReturnValue({ toArray: mockToArray });
    mockLimit.mockReturnValue({ project: mockProject, toArray: mockToArray });
    mockSkip.mockReturnValue({ limit: mockLimit });
    mockSort.mockReturnValue({ skip: mockSkip });
    mockFind.mockReturnValue({ sort: mockSort });
  });

  it("returns documents modified since timestamp", async () => {
    const request = new NextRequest(
      "http://localhost/api/v3/entries/history?last=1700000000000"
    );
    const response = await GET(request, {
      params: Promise.resolve({ collection: "entries" })
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.status).toBe(200);
    expect(payload.result).toBeDefined();
    expect(Array.isArray(payload.result)).toBe(true);
    expect(payload.result.length).toBe(2);
  });

  it("returns lastModified timestamp in response", async () => {
    const request = new NextRequest(
      "http://localhost/api/v3/entries/history?last=1700000000000"
    );
    const response = await GET(request, {
      params: Promise.resolve({ collection: "entries" })
    });

    const payload = await response.json();
    expect(payload.lastModified).toBeDefined();
    expect(payload.lastModified).toBe(1700000002000);
  });

  it("returns 404 for invalid collection", async () => {
    const request = new NextRequest(
      "http://localhost/api/v3/invalid/history"
    );
    const response = await GET(request, {
      params: Promise.resolve({ collection: "invalid" })
    });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.message).toBe("Not Found");
  });

  it("returns 401 when not authorized", async () => {
    const { resolveAuth, checkPermission } = require("@/lib/api/auth");
    resolveAuth.mockResolvedValueOnce({
      authorized: false,
      permissions: []
    });
    checkPermission.mockReturnValueOnce(false);

    const request = new NextRequest(
      "http://localhost/api/v3/entries/history"
    );
    const response = await GET(request, {
      params: Promise.resolve({ collection: "entries" })
    });

    expect(response.status).toBe(401);
  });

  it("returns 403 when authorized but missing permission", async () => {
    const { resolveAuth, checkPermission } = require("@/lib/api/auth");
    resolveAuth.mockResolvedValueOnce({
      authorized: true,
      permissions: ["api:treatments:read"]
    });
    checkPermission.mockReturnValueOnce(false);

    const request = new NextRequest(
      "http://localhost/api/v3/entries/history"
    );
    const response = await GET(request, {
      params: Promise.resolve({ collection: "entries" })
    });

    expect(response.status).toBe(403);
  });

  it("requires admin permission for settings history", async () => {
    const { checkPermission } = require("@/lib/api/auth");
    mockToArray.mockResolvedValueOnce([]);

    const request = new NextRequest(
      "http://localhost/api/v3/settings/history"
    );
    await GET(request, {
      params: Promise.resolve({ collection: "settings" })
    });

    expect(checkPermission).toHaveBeenCalledWith(
      expect.anything(),
      "api:settings:admin"
    );
  });

  it("applies limit parameter", async () => {
    const { parseV3Query } = require("@/lib/api/v3-query");

    const request = new NextRequest(
      "http://localhost/api/v3/entries/history?limit=50"
    );
    await GET(request, {
      params: Promise.resolve({ collection: "entries" })
    });

    expect(parseV3Query).toHaveBeenCalled();
  });

  it("applies fields parameter", async () => {
    const { parseV3Query, buildProjection } = require("@/lib/api/v3-query");

    const request = new NextRequest(
      "http://localhost/api/v3/entries/history?fields=date,sgv"
    );
    await GET(request, {
      params: Promise.resolve({ collection: "entries" })
    });

    expect(parseV3Query).toHaveBeenCalled();
    expect(buildProjection).toHaveBeenCalled();
  });

  it("includes soft-deleted documents in history", async () => {
    mockToArray.mockResolvedValueOnce([
      {
        _id: "abc123",
        identifier: "entry-1",
        sgv: 110,
        srvModified: 1700000001000
      },
      {
        _id: "def456",
        identifier: "deleted-entry",
        isValid: false,
        srvModified: 1700000002000
      }
    ]);

    const request = new NextRequest(
      "http://localhost/api/v3/entries/history?last=1700000000000"
    );
    const response = await GET(request, {
      params: Promise.resolve({ collection: "entries" })
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.result.length).toBe(2);
    // Should include soft-deleted document
    expect(payload.result.some((d: { isValid?: boolean }) => d.isValid === false)).toBe(true);
  });
});

