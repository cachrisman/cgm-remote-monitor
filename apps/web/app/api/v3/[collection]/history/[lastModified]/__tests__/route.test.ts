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

describe("GET /api/v3/:collection/history/:lastModified (HISTORY2)", () => {
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

  it("returns documents modified since path timestamp", async () => {
    const request = new NextRequest(
      "http://localhost/api/v3/entries/history/1700000000000"
    );
    const response = await GET(request, {
      params: Promise.resolve({ collection: "entries", lastModified: "1700000000000" })
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.status).toBe(200);
    expect(payload.result).toBeDefined();
    expect(Array.isArray(payload.result)).toBe(true);
  });

  it("returns 400 for invalid lastModified timestamp", async () => {
    const request = new NextRequest(
      "http://localhost/api/v3/entries/history/not-a-number"
    );
    const response = await GET(request, {
      params: Promise.resolve({ collection: "entries", lastModified: "not-a-number" })
    });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.message).toBe("Bad Request");
  });

  it("returns 404 for invalid collection", async () => {
    const request = new NextRequest(
      "http://localhost/api/v3/invalid/history/1700000000000"
    );
    const response = await GET(request, {
      params: Promise.resolve({ collection: "invalid", lastModified: "1700000000000" })
    });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.message).toBe("Not Found");
  });

  it("returns lastModified as maximum srvModified", async () => {
    const request = new NextRequest(
      "http://localhost/api/v3/entries/history/1700000000000"
    );
    const response = await GET(request, {
      params: Promise.resolve({ collection: "entries", lastModified: "1700000000000" })
    });

    const payload = await response.json();
    expect(payload.lastModified).toBe(1700000002000);
  });

  it("uses greater than operator for timestamp filtering", async () => {
    const request = new NextRequest(
      "http://localhost/api/v3/entries/history/1700000000000"
    );
    await GET(request, {
      params: Promise.resolve({ collection: "entries", lastModified: "1700000000000" })
    });

    expect(mockFind).toHaveBeenCalled();
    const filterArg = mockFind.mock.calls[0][0];
    expect(filterArg.srvModified).toEqual({ $gt: 1700000000000 });
  });

  it("returns 401 when not authorized", async () => {
    const { resolveAuth, checkPermission } = require("@/lib/api/auth");
    resolveAuth.mockResolvedValueOnce({
      authorized: false,
      permissions: []
    });
    checkPermission.mockReturnValueOnce(false);

    const request = new NextRequest(
      "http://localhost/api/v3/entries/history/1700000000000"
    );
    const response = await GET(request, {
      params: Promise.resolve({ collection: "entries", lastModified: "1700000000000" })
    });

    expect(response.status).toBe(401);
  });

  it("applies limit parameter", async () => {
    const request = new NextRequest(
      "http://localhost/api/v3/entries/history/1700000000000?limit=50"
    );
    await GET(request, {
      params: Promise.resolve({ collection: "entries", lastModified: "1700000000000" })
    });

    expect(mockLimit).toHaveBeenCalled();
  });

  it("applies fields parameter", async () => {
    const { buildProjection } = require("@/lib/api/v3-query");

    const request = new NextRequest(
      "http://localhost/api/v3/entries/history/1700000000000?fields=date,sgv"
    );
    await GET(request, {
      params: Promise.resolve({ collection: "entries", lastModified: "1700000000000" })
    });

    expect(buildProjection).toHaveBeenCalled();
  });

  it("handles millisecond precision timestamps", async () => {
    const preciseTimestamp = "1700000000123";
    const request = new NextRequest(
      `http://localhost/api/v3/entries/history/${preciseTimestamp}`
    );
    await GET(request, {
      params: Promise.resolve({ collection: "entries", lastModified: preciseTimestamp })
    });

    expect(mockFind).toHaveBeenCalled();
    const filterArg = mockFind.mock.calls[0][0];
    expect(filterArg.srvModified).toEqual({ $gt: 1700000000123 });
  });
});

