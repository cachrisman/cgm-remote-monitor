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
            device: "openaps://hostname",
            created_at: "2023-11-14T22:13:20.000Z",
            uploader: { battery: 85 }
          }
        ])
      )
    }))
  }))
}));
const mockDeleteOne = jest.fn(() => Promise.resolve({ deletedCount: 1 }));
const mockDeleteMany = jest.fn(() => Promise.resolve({ deletedCount: 3 }));

jest.mock("@/lib/api/collections", () => ({
  getDeviceStatusCollection: jest.fn(() =>
    Promise.resolve({
      findOne: mockFindOne,
      find: mockFind,
      deleteOne: mockDeleteOne,
      deleteMany: mockDeleteMany
    })
  )
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

describe("GET /api/v1/devicestatus/:spec", () => {
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
                device: "openaps://hostname",
                created_at: "2023-11-14T22:13:20.000Z",
                uploader: { battery: 85 }
              }
            ])
          )
        }))
      }))
    }));
  });

  it("returns single devicestatus when spec is a valid ObjectId", async () => {
    const testId = "507f1f77bcf86cd799439011";
    mockFindOne.mockResolvedValueOnce({
      _id: testId,
      device: "openaps://hostname",
      created_at: "2023-11-14T22:00:00.000Z",
      uploader: { battery: 90 }
    });

    const request = new NextRequest(
      `http://localhost/api/v1/devicestatus/${testId}`
    );
    const response = await GET(request, {
      params: Promise.resolve({ spec: testId })
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    // Legacy behavior returns array even for single status by ID
    expect(Array.isArray(payload)).toBe(true);
    expect(payload[0].device).toBe("openaps://hostname");
    expect(payload[0].uploader.battery).toBe(90);
  });

  it("returns 404 when ObjectId devicestatus not found", async () => {
    const testId = "507f1f77bcf86cd799439011";
    mockFindOne.mockResolvedValueOnce(null);

    const request = new NextRequest(
      `http://localhost/api/v1/devicestatus/${testId}`
    );
    const response = await GET(request, {
      params: Promise.resolve({ spec: testId })
    });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.error).toBe("Device status not found");
  });

  it("returns devicestatus filtered by device when spec is device name", async () => {
    const request = new NextRequest(
      "http://localhost/api/v1/devicestatus/openaps"
    );
    const response = await GET(request, {
      params: Promise.resolve({ spec: "openaps" })
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload)).toBe(true);
  });

  it("applies count parameter to device filter queries", async () => {
    const request = new NextRequest(
      "http://localhost/api/v1/devicestatus/loop?count=5"
    );
    await GET(request, {
      params: Promise.resolve({ spec: "loop" })
    });

    expect(mockFind).toHaveBeenCalled();
  });

  it("applies find parameters to device filter queries", async () => {
    const request = new NextRequest(
      "http://localhost/api/v1/devicestatus/openaps?find[created_at][$gte]=2023-11-01"
    );
    await GET(request, {
      params: Promise.resolve({ spec: "openaps" })
    });

    expect(mockFind).toHaveBeenCalled();
  });

  it("returns 401 when not authorized", async () => {
    const { checkPermission } = require("@/lib/api/auth");
    checkPermission.mockReturnValueOnce(false);

    const request = new NextRequest(
      "http://localhost/api/v1/devicestatus/openaps"
    );
    const response = await GET(request, {
      params: Promise.resolve({ spec: "openaps" })
    });

    expect(response.status).toBe(401);
  });
});

describe("DELETE /api/v1/devicestatus/:spec", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteOne.mockReset();
    mockDeleteMany.mockReset();
    mockDeleteOne.mockResolvedValue({ deletedCount: 1 });
    mockDeleteMany.mockResolvedValue({ deletedCount: 3 });
  });

  it("deletes single devicestatus when spec is ObjectId", async () => {
    const testId = "507f1f77bcf86cd799439011";

    const request = new NextRequest(
      `http://localhost/api/v1/devicestatus/${testId}`,
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

  it("returns 404 when ObjectId devicestatus not found for deletion", async () => {
    const testId = "507f1f77bcf86cd799439011";
    mockDeleteOne.mockResolvedValueOnce({ deletedCount: 0 });

    const request = new NextRequest(
      `http://localhost/api/v1/devicestatus/${testId}`,
      { method: "DELETE" }
    );
    const response = await DELETE(request, {
      params: Promise.resolve({ spec: testId })
    });

    expect(response.status).toBe(404);
  });

  it("deletes devicestatus by device filter when spec is device name", async () => {
    const request = new NextRequest(
      "http://localhost/api/v1/devicestatus/openaps",
      { method: "DELETE" }
    );
    const response = await DELETE(request, {
      params: Promise.resolve({ spec: "openaps" })
    });

    expect(response.status).toBe(200);
    expect(mockDeleteMany).toHaveBeenCalled();

    const payload = await response.json();
    expect(payload.deletedCount).toBe(3);
  });

  it("returns 401 when not authorized to delete", async () => {
    const { checkPermission } = require("@/lib/api/auth");
    checkPermission.mockReturnValueOnce(false);

    const request = new NextRequest(
      "http://localhost/api/v1/devicestatus/openaps",
      { method: "DELETE" }
    );
    const response = await DELETE(request, {
      params: Promise.resolve({ spec: "openaps" })
    });

    expect(response.status).toBe(401);
  });
});

