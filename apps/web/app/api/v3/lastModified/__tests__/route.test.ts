/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

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

const mockFindOne = jest.fn();

jest.mock("@/lib/api/collections", () => ({
  getEntriesCollection: jest.fn(() =>
    Promise.resolve({
      findOne: mockFindOne
    })
  ),
  getTreatmentsCollection: jest.fn(() =>
    Promise.resolve({
      findOne: mockFindOne
    })
  ),
  getDeviceStatusCollection: jest.fn(() =>
    Promise.resolve({
      findOne: mockFindOne
    })
  ),
  getProfileCollection: jest.fn(() =>
    Promise.resolve({
      findOne: mockFindOne
    })
  ),
  getFoodCollection: jest.fn(() =>
    Promise.resolve({
      findOne: mockFindOne
    })
  ),
  getSettingsCollection: jest.fn(() =>
    Promise.resolve({
      findOne: mockFindOne
    })
  )
}));

describe("GET /api/v3/lastModified", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
    
    // Default mock returns a document with srvModified
    mockFindOne.mockResolvedValue({
      srvModified: 1700000000000
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns last modified timestamps for all collections", async () => {
    const request = new NextRequest("http://localhost/api/v3/lastModified");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.status).toBe(200);
    expect(payload.result).toBeDefined();
    expect(payload.result.srvDate).toBeDefined();
    expect(payload.result.collections).toBeDefined();
  });

  it("returns timestamps for each collection user has access to", async () => {
    const request = new NextRequest("http://localhost/api/v3/lastModified");
    const response = await GET(request);

    const payload = await response.json();
    const collections = payload.result.collections;

    // Should include all collections when user has full permissions
    expect(collections.entries).toBeDefined();
    expect(collections.treatments).toBeDefined();
    expect(collections.devicestatus).toBeDefined();
    expect(collections.profile).toBeDefined();
    expect(collections.food).toBeDefined();
    expect(collections.settings).toBeDefined();
  });

  it("returns 401 when not authorized", async () => {
    const { resolveAuth, checkPermission } = require("@/lib/api/auth");
    resolveAuth.mockResolvedValueOnce({
      authorized: false,
      permissions: []
    });

    const request = new NextRequest("http://localhost/api/v3/lastModified");
    const response = await GET(request);

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.status).toBe(401);
    expect(payload.message).toBe("Unauthorized");
  });

  it("only returns collections user has permission for", async () => {
    const { resolveAuth, checkPermission } = require("@/lib/api/auth");
    resolveAuth.mockResolvedValueOnce({
      authorized: true,
      permissions: ["api:entries:read", "api:treatments:read"]
    });
    checkPermission.mockImplementation(
      (perms: string[], required: string) =>
        perms.includes("*") ||
        perms.includes(required) ||
        (required === "api:entries:read" && perms.includes("api:entries:read")) ||
        (required === "api:treatments:read" &&
          perms.includes("api:treatments:read"))
    );

    const request = new NextRequest("http://localhost/api/v3/lastModified");
    const response = await GET(request);

    const payload = await response.json();
    const collections = payload.result.collections;

    // Should only include collections with permission
    expect(collections.entries).toBeDefined();
    expect(collections.treatments).toBeDefined();
    // These should not be present
    expect(collections.devicestatus).toBeUndefined();
    expect(collections.settings).toBeUndefined();
  });

  it("returns null for collections with no documents", async () => {
    mockFindOne.mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/v3/lastModified");
    const response = await GET(request);

    const payload = await response.json();
    expect(payload.result.collections.entries).toBeNull();
  });

  it("handles numeric timestamps", async () => {
    mockFindOne.mockResolvedValue({
      srvModified: 1700000000000
    });

    const request = new NextRequest("http://localhost/api/v3/lastModified");
    const response = await GET(request);

    const payload = await response.json();
    expect(payload.result.collections.entries).toBe(1700000000000);
  });

  it("handles string date values", async () => {
    mockFindOne.mockResolvedValue({
      date: "2025-01-01T00:00:00.000Z"
    });

    const request = new NextRequest("http://localhost/api/v3/lastModified");
    const response = await GET(request);

    const payload = await response.json();
    // String date should be parsed to timestamp
    expect(typeof payload.result.collections.entries).toBe("number");
  });

  it("handles Date object values", async () => {
    const date = new Date("2025-01-01T00:00:00.000Z");
    mockFindOne.mockResolvedValue({
      srvModified: date
    });

    const request = new NextRequest("http://localhost/api/v3/lastModified");
    const response = await GET(request);

    const payload = await response.json();
    expect(payload.result.collections.entries).toBe(date.getTime());
  });

  it("returns current server time in srvDate", async () => {
    const expectedTime = new Date("2025-01-01T00:00:00.000Z").getTime();

    const request = new NextRequest("http://localhost/api/v3/lastModified");
    const response = await GET(request);

    const payload = await response.json();
    expect(payload.result.srvDate).toBe(expectedTime);
  });

  it("handles internal errors gracefully", async () => {
    const { resolveAuth } = require("@/lib/api/auth");
    resolveAuth.mockRejectedValueOnce(new Error("Database connection failed"));

    const request = new NextRequest("http://localhost/api/v3/lastModified");
    const response = await GET(request);

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.status).toBe(500);
    expect(payload.message).toBe("Database connection failed");
  });

  it("requires admin permission for settings collection", async () => {
    const { checkPermission } = require("@/lib/api/auth");

    const request = new NextRequest("http://localhost/api/v3/lastModified");
    await GET(request);

    // Verify that settings requires admin permission
    expect(checkPermission).toHaveBeenCalledWith(
      expect.anything(),
      "api:settings:admin"
    );
  });
});

