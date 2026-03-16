/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from "next/server";

import { GET, DELETE } from "../route";

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

const mockFindOne = jest.fn();
const mockFind = jest.fn(() => ({
  sort: jest.fn(() => ({
    limit: jest.fn(() => ({
      toArray: jest.fn(() =>
        Promise.resolve([
          {
            _id: "abc123000000000000000001",
            type: "sgv",
            sgv: 110,
            date: 1700000000000,
            direction: "Flat"
          }
        ])
      )
    }))
  }))
}));
const mockDeleteOne = jest.fn(() => Promise.resolve({ deletedCount: 1 }));

jest.mock("@/lib/api/collections", () => ({
  getEntriesCollection: jest.fn(() =>
    Promise.resolve({
      findOne: mockFindOne,
      find: mockFind,
      deleteOne: mockDeleteOne
    })
  )
}));

jest.mock("@/lib/api/entries", () => ({
  deleteEntries: jest.fn(() => Promise.resolve({ deletedCount: 5 }))
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

describe("GET /api/v1/entries/:spec", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindOne.mockReset();
    mockFind.mockReset();

    // Reset mockFind to default behavior
    mockFind.mockImplementation(() => ({
      sort: jest.fn(() => ({
        limit: jest.fn(() => ({
          toArray: jest.fn(() =>
            Promise.resolve([
              {
                _id: "abc123000000000000000001",
                type: "sgv",
                sgv: 110,
                date: 1700000000000,
                direction: "Flat"
              }
            ])
          )
        }))
      }))
    }));
  });

  it("returns single entry when spec is a valid ObjectId", async () => {
    const testId = "507f1f77bcf86cd799439011";
    mockFindOne.mockResolvedValueOnce({
      _id: testId,
      type: "sgv",
      sgv: 120,
      date: 1700000000000,
      direction: "Flat"
    });

    const request = new NextRequest(
      `http://localhost/api/v1/entries/${testId}`
    );
    const response = await GET(request, {
      params: Promise.resolve({ spec: testId })
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    // Legacy behavior returns array even for single entry by ID
    expect(Array.isArray(payload)).toBe(true);
    expect(payload[0].sgv).toBe(120);
  });

  it("returns 404 when ObjectId entry not found", async () => {
    const testId = "507f1f77bcf86cd799439011";
    mockFindOne.mockResolvedValueOnce(null);

    const request = new NextRequest(
      `http://localhost/api/v1/entries/${testId}`
    );
    const response = await GET(request, {
      params: Promise.resolve({ spec: testId })
    });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.error).toBe("Entry not found");
  });

  it("returns current entry when spec is 'current'", async () => {
    mockFindOne.mockResolvedValueOnce({
      _id: "abc123000000000000000001",
      type: "sgv",
      sgv: 115,
      date: 1700000300000,
      direction: "FortyFiveUp"
    });

    const request = new NextRequest("http://localhost/api/v1/entries/current");
    const response = await GET(request, {
      params: Promise.resolve({ spec: "current" })
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.sgv).toBe(115);
    expect(payload.direction).toBe("FortyFiveUp");
  });

  it("returns 404 when no entries exist for 'current'", async () => {
    mockFindOne.mockResolvedValueOnce(null);

    const request = new NextRequest("http://localhost/api/v1/entries/current");
    const response = await GET(request, {
      params: Promise.resolve({ spec: "current" })
    });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.error).toBe("No entries found");
  });

  it("returns entries filtered by type when spec is sgv", async () => {
    const request = new NextRequest("http://localhost/api/v1/entries/sgv");
    const response = await GET(request, {
      params: Promise.resolve({ spec: "sgv" })
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload)).toBe(true);
    expect(payload[0].type).toBe("sgv");
  });

  it("returns entries filtered by type when spec is mbg", async () => {
    (mockFind as jest.Mock).mockImplementationOnce(() => ({
      sort: jest.fn(() => ({
        limit: jest.fn(() => ({
          toArray: jest.fn(() =>
            Promise.resolve([
              {
                _id: "abc123000000000000000002",
                type: "mbg",
                mbg: 100,
                date: 1700000000000
              }
            ])
          )
        }))
      }))
    }));

    const request = new NextRequest("http://localhost/api/v1/entries/mbg");
    const response = await GET(request, {
      params: Promise.resolve({ spec: "mbg" })
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload)).toBe(true);
    expect(payload[0].type).toBe("mbg");
  });

  it("applies count parameter to type filter queries", async () => {
    const request = new NextRequest(
      "http://localhost/api/v1/entries/sgv?count=5"
    );
    await GET(request, {
      params: Promise.resolve({ spec: "sgv" })
    });

    // Check that find was called (type filter path)
    expect(mockFind).toHaveBeenCalled();
  });

  it("applies find parameters to type filter queries", async () => {
    const request = new NextRequest(
      "http://localhost/api/v1/entries/sgv?find[sgv][$gte]=100"
    );
    await GET(request, {
      params: Promise.resolve({ spec: "sgv" })
    });

    expect(mockFind).toHaveBeenCalled();
  });

  it("returns 401 when not authorized", async () => {
    const { checkPermission } = require("@/lib/api/auth");
    checkPermission.mockReturnValueOnce(false);

    const request = new NextRequest("http://localhost/api/v1/entries/sgv");
    const response = await GET(request, {
      params: Promise.resolve({ spec: "sgv" })
    });

    expect(response.status).toBe(401);
  });
});

describe("DELETE /api/v1/entries/:spec", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteOne.mockReset();
    mockDeleteOne.mockResolvedValue({ deletedCount: 1 });
  });

  it("deletes single entry when spec is ObjectId", async () => {
    const testId = "507f1f77bcf86cd799439011";

    const request = new NextRequest(
      `http://localhost/api/v1/entries/${testId}`,
      { method: "DELETE" }
    );
    const response = await DELETE(request, {
      params: Promise.resolve({ spec: testId })
    });

    expect(response.status).toBe(200);
    expect(mockDeleteOne).toHaveBeenCalled();

    const payload = await response.json();
    expect(payload.deletedCount).toBe(1);
  });

  it("returns 404 when ObjectId entry not found for deletion", async () => {
    const testId = "507f1f77bcf86cd799439011";
    mockDeleteOne.mockResolvedValueOnce({ deletedCount: 0 });

    const request = new NextRequest(
      `http://localhost/api/v1/entries/${testId}`,
      { method: "DELETE" }
    );
    const response = await DELETE(request, {
      params: Promise.resolve({ spec: testId })
    });

    expect(response.status).toBe(404);
  });

  it("deletes entries by type filter when spec is type", async () => {
    const { deleteEntries } = require("@/lib/api/entries");

    const request = new NextRequest("http://localhost/api/v1/entries/sgv", {
      method: "DELETE"
    });
    const response = await DELETE(request, {
      params: Promise.resolve({ spec: "sgv" })
    });

    expect(response.status).toBe(200);
    expect(deleteEntries).toHaveBeenCalled();

    // Check that type filter was added
    const searchParams = deleteEntries.mock.calls[0][0];
    expect(searchParams.get("find[type]")).toBe("sgv");
  });

  it("returns 401 when not authorized to delete", async () => {
    const { checkPermission } = require("@/lib/api/auth");
    checkPermission.mockReturnValueOnce(false);

    const request = new NextRequest("http://localhost/api/v1/entries/sgv", {
      method: "DELETE"
    });
    const response = await DELETE(request, {
      params: Promise.resolve({ spec: "sgv" })
    });

    expect(response.status).toBe(401);
  });
});

