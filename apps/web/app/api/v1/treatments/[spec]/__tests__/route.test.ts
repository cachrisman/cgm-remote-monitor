/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from "next/server";

import { GET, DELETE, PUT } from "../route";

// Mock dependencies
const mockFindOne = jest.fn();
const mockFind = jest.fn(() => ({
  sort: jest.fn(() => ({
    limit: jest.fn(() => ({
      toArray: jest.fn(() =>
        Promise.resolve([
          {
            _id: "abc123000000000000000001",
            eventType: "Correction Bolus",
            insulin: 2.5,
            created_at: "2023-11-14T22:13:20.000Z"
          }
        ])
      )
    }))
  }))
}));
const mockDeleteOne = jest.fn(() => Promise.resolve({ deletedCount: 1 }));
const mockDeleteMany = jest.fn(() => Promise.resolve({ deletedCount: 3 }));
const mockFindOneAndUpdate = jest.fn();

jest.mock("@/lib/api/collections", () => ({
  getTreatmentsCollection: jest.fn(() =>
    Promise.resolve({
      findOne: mockFindOne,
      find: mockFind,
      deleteOne: mockDeleteOne,
      deleteMany: mockDeleteMany,
      findOneAndUpdate: mockFindOneAndUpdate
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

describe("GET /api/v1/treatments/:spec", () => {
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
                eventType: "Correction Bolus",
                insulin: 2.5,
                created_at: "2023-11-14T22:13:20.000Z"
              }
            ])
          )
        }))
      }))
    }));
  });

  it("returns single treatment when spec is a valid ObjectId", async () => {
    const testId = "507f1f77bcf86cd799439011";
    mockFindOne.mockResolvedValueOnce({
      _id: testId,
      eventType: "Correction Bolus",
      insulin: 3.0,
      created_at: "2023-11-14T22:00:00.000Z"
    });

    const request = new NextRequest(
      `http://localhost/api/v1/treatments/${testId}`
    );
    const response = await GET(request, {
      params: Promise.resolve({ spec: testId })
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    // Legacy behavior returns array even for single treatment by ID
    expect(Array.isArray(payload)).toBe(true);
    expect(payload[0].insulin).toBe(3.0);
  });

  it("returns 404 when ObjectId treatment not found", async () => {
    const testId = "507f1f77bcf86cd799439011";
    mockFindOne.mockResolvedValueOnce(null);

    const request = new NextRequest(
      `http://localhost/api/v1/treatments/${testId}`
    );
    const response = await GET(request, {
      params: Promise.resolve({ spec: testId })
    });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.error).toBe("Treatment not found");
  });

  it("returns treatments filtered by eventType when spec is eventType", async () => {
    mockFind.mockImplementationOnce(() => ({
      sort: jest.fn(() => ({
        limit: jest.fn(() => ({
          toArray: jest.fn(() =>
            Promise.resolve([
              {
                _id: "abc123000000000000000001",
                eventType: "Correction Bolus",
                insulin: 2.5,
                created_at: "2023-11-14T22:13:20.000Z"
              },
              {
                _id: "abc123000000000000000002",
                eventType: "Correction Bolus",
                insulin: 3.0,
                created_at: "2023-11-14T20:00:00.000Z"
              }
            ])
          )
        }))
      }))
    }));

    const request = new NextRequest(
      "http://localhost/api/v1/treatments/Correction+Bolus"
    );
    const response = await GET(request, {
      params: Promise.resolve({ spec: "Correction Bolus" })
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload)).toBe(true);
  });

  it("applies count parameter to eventType queries", async () => {
    const request = new NextRequest(
      "http://localhost/api/v1/treatments/Correction+Bolus?count=5"
    );
    await GET(request, {
      params: Promise.resolve({ spec: "Correction Bolus" })
    });

    expect(mockFind).toHaveBeenCalled();
  });

  it("applies find parameters to eventType queries", async () => {
    const request = new NextRequest(
      "http://localhost/api/v1/treatments/Correction+Bolus?find[insulin][$gte]=2"
    );
    await GET(request, {
      params: Promise.resolve({ spec: "Correction Bolus" })
    });

    expect(mockFind).toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/treatments/:spec", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteOne.mockReset();
    mockDeleteMany.mockReset();
    mockDeleteOne.mockResolvedValue({ deletedCount: 1 });
    mockDeleteMany.mockResolvedValue({ deletedCount: 3 });
  });

  it("deletes single treatment when spec is ObjectId", async () => {
    const testId = "507f1f77bcf86cd799439011";

    const request = new NextRequest(
      `http://localhost/api/v1/treatments/${testId}`,
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

  it("returns 404 when ObjectId treatment not found for deletion", async () => {
    const testId = "507f1f77bcf86cd799439011";
    mockDeleteOne.mockResolvedValueOnce({ deletedCount: 0 });

    const request = new NextRequest(
      `http://localhost/api/v1/treatments/${testId}`,
      { method: "DELETE" }
    );
    const response = await DELETE(request, {
      params: Promise.resolve({ spec: testId })
    });

    expect(response.status).toBe(404);
  });

  it("deletes treatments by eventType when spec is eventType", async () => {
    const request = new NextRequest(
      "http://localhost/api/v1/treatments/Note",
      { method: "DELETE" }
    );
    const response = await DELETE(request, {
      params: Promise.resolve({ spec: "Note" })
    });

    expect(response.status).toBe(200);
    expect(mockDeleteMany).toHaveBeenCalled();

    const payload = await response.json();
    expect(payload.deletedCount).toBe(3);
  });
});

describe("PUT /api/v1/treatments/:spec", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindOneAndUpdate.mockReset();
  });

  it("updates treatment by ObjectId", async () => {
    const testId = "507f1f77bcf86cd799439011";
    mockFindOneAndUpdate.mockResolvedValueOnce({
      _id: testId,
      eventType: "Correction Bolus",
      insulin: 4.0,
      notes: "Updated"
    });

    const body = { insulin: 4.0, notes: "Updated" };
    const request = new NextRequest(
      `http://localhost/api/v1/treatments/${testId}`,
      {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" }
      }
    );

    const response = await PUT(request, {
      params: Promise.resolve({ spec: testId })
    });

    expect(response.status).toBe(200);
    expect(mockFindOneAndUpdate).toHaveBeenCalled();

    const payload = await response.json();
    expect(payload.insulin).toBe(4.0);
    expect(payload.notes).toBe("Updated");
  });

  it("returns 400 for invalid ObjectId format", async () => {
    const request = new NextRequest(
      "http://localhost/api/v1/treatments/not-an-objectid",
      {
        method: "PUT",
        body: JSON.stringify({ insulin: 4.0 }),
        headers: { "Content-Type": "application/json" }
      }
    );

    const response = await PUT(request, {
      params: Promise.resolve({ spec: "not-an-objectid" })
    });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("Invalid treatment ID format");
  });

  it("returns 404 when treatment not found", async () => {
    const testId = "507f1f77bcf86cd799439011";
    mockFindOneAndUpdate.mockResolvedValueOnce(null);

    const body = { insulin: 4.0 };
    const request = new NextRequest(
      `http://localhost/api/v1/treatments/${testId}`,
      {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" }
      }
    );

    const response = await PUT(request, {
      params: Promise.resolve({ spec: testId })
    });

    expect(response.status).toBe(404);
  });

  it("removes _id from update payload", async () => {
    const testId = "507f1f77bcf86cd799439011";
    mockFindOneAndUpdate.mockResolvedValueOnce({
      _id: testId,
      insulin: 4.0
    });

    const body = { _id: "different-id", insulin: 4.0 };
    const request = new NextRequest(
      `http://localhost/api/v1/treatments/${testId}`,
      {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" }
      }
    );

    await PUT(request, {
      params: Promise.resolve({ spec: testId })
    });

    // Verify _id was removed from the $set operation
    const updateCall = mockFindOneAndUpdate.mock.calls[0];
    const setFields = updateCall[1].$set;
    expect(setFields._id).toBeUndefined();
  });
});

