/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from "next/server";

import { GET, POST, DELETE } from "../route";

// Mock dependencies
jest.mock("@/lib/api/profile", () => ({
  findProfiles: jest.fn(() =>
    Promise.resolve([
      {
        _id: "abc123000000000000000001",
        defaultProfile: "Default",
        store: {
          Default: {
            sens: 40,
            dia: 4,
            carbratio: 10,
            carbs_hr: 20,
            basal: [{ time: "00:00", value: 1.0 }],
            target_low: [{ time: "00:00", value: 100 }],
            target_high: [{ time: "00:00", value: 120 }]
          }
        },
        startDate: "2023-01-01T00:00:00.000Z"
      }
    ])
  ),
  saveProfiles: jest.fn((payload) => {
    const profiles = Array.isArray(payload) ? payload : [payload];
    return Promise.resolve(
      profiles.map((p, idx) => ({
        _id: `new-id-${idx}`,
        ...p
      }))
    );
  }),
  deleteProfiles: jest.fn(() => Promise.resolve({ deletedCount: 1 })),
  getCurrentProfile: jest.fn(() =>
    Promise.resolve({
      _id: "abc123000000000000000001",
      defaultProfile: "Default",
      store: {
        Default: {
          sens: 40,
          dia: 4,
          carbratio: 10,
          carbs_hr: 20
        }
      },
      startDate: "2023-01-01T00:00:00.000Z"
    })
  )
}));

describe("GET /api/v1/profile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns current profile when no query params", async () => {
    const request = new NextRequest("http://localhost/api/v1/profile");
    const response = await GET(request);

    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(Array.isArray(payload)).toBe(true);
    expect(payload.length).toBe(1);
    expect(payload[0].defaultProfile).toBe("Default");
  });

  it("returns empty array when no current profile exists", async () => {
    const { getCurrentProfile } = require("@/lib/api/profile");
    getCurrentProfile.mockResolvedValueOnce(null);

    const request = new NextRequest("http://localhost/api/v1/profile");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload)).toBe(true);
    expect(payload.length).toBe(0);
  });

  it("uses findProfiles when find parameter is present", async () => {
    const { findProfiles } = require("@/lib/api/profile");

    const request = new NextRequest(
      "http://localhost/api/v1/profile?find[defaultProfile]=Default"
    );
    await GET(request);

    expect(findProfiles).toHaveBeenCalled();
  });

  it("uses findProfiles when count parameter is present", async () => {
    const { findProfiles } = require("@/lib/api/profile");

    const request = new NextRequest(
      "http://localhost/api/v1/profile?count=5"
    );
    await GET(request);

    expect(findProfiles).toHaveBeenCalled();
  });

  it("passes find parameters to findProfiles", async () => {
    const { findProfiles } = require("@/lib/api/profile");

    const request = new NextRequest(
      "http://localhost/api/v1/profile?find[startDate][$gte]=2023-01-01"
    );
    await GET(request);

    expect(findProfiles).toHaveBeenCalled();
    const searchParams = findProfiles.mock.calls[0][0] as URLSearchParams;
    // Nested find params use the full key including brackets
    expect(searchParams.has("find[startDate][$gte]")).toBe(true);
  });

  it("returns 400 on error", async () => {
    const { getCurrentProfile } = require("@/lib/api/profile");
    getCurrentProfile.mockRejectedValueOnce(new Error("Database error"));

    const request = new NextRequest("http://localhost/api/v1/profile");
    const response = await GET(request);

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("Database error");
  });
});

describe("POST /api/v1/profile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a profile and returns 201", async () => {
    const body = {
      defaultProfile: "NewProfile",
      store: {
        NewProfile: {
          sens: 35,
          dia: 5,
          carbratio: 12,
          carbs_hr: 25
        }
      },
      startDate: "2023-06-01T00:00:00.000Z"
    };
    const request = new NextRequest("http://localhost/api/v1/profile", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(Array.isArray(payload)).toBe(true);
    expect(payload[0].defaultProfile).toBe("NewProfile");
  });

  it("creates multiple profiles from array", async () => {
    const body = [
      { defaultProfile: "Profile1", store: {} },
      { defaultProfile: "Profile2", store: {} }
    ];
    const request = new NextRequest("http://localhost/api/v1/profile", {
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

  it("handles profile with basal rates", async () => {
    const body = {
      defaultProfile: "Default",
      store: {
        Default: {
          sens: 40,
          dia: 4,
          carbratio: 10,
          basal: [
            { time: "00:00", value: 1.0 },
            { time: "06:00", value: 1.2 },
            { time: "12:00", value: 1.1 },
            { time: "18:00", value: 1.0 }
          ]
        }
      }
    };
    const request = new NextRequest("http://localhost/api/v1/profile", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
  });

  it("handles profile with target ranges", async () => {
    const body = {
      defaultProfile: "Default",
      store: {
        Default: {
          sens: 40,
          dia: 4,
          target_low: [{ time: "00:00", value: 100 }],
          target_high: [{ time: "00:00", value: 120 }]
        }
      }
    };
    const request = new NextRequest("http://localhost/api/v1/profile", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
  });

  it("returns 400 on error", async () => {
    const { saveProfiles } = require("@/lib/api/profile");
    saveProfiles.mockRejectedValueOnce(new Error("Invalid profile"));

    const body = { invalid: true };
    const request = new NextRequest("http://localhost/api/v1/profile", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("Invalid profile");
  });
});

describe("DELETE /api/v1/profile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("deletes profiles", async () => {
    const { deleteProfiles } = require("@/lib/api/profile");

    const request = new NextRequest("http://localhost/api/v1/profile", {
      method: "DELETE"
    });
    const response = await DELETE(request);

    expect(response.status).toBe(200);
    expect(deleteProfiles).toHaveBeenCalled();

    const payload = await response.json();
    expect(payload.deletedCount).toBe(1);
  });

  it("passes query parameters to deleteProfiles", async () => {
    const { deleteProfiles } = require("@/lib/api/profile");

    const request = new NextRequest(
      "http://localhost/api/v1/profile?find[defaultProfile]=OldProfile",
      { method: "DELETE" }
    );
    await DELETE(request);

    expect(deleteProfiles).toHaveBeenCalled();
  });

  it("returns 400 on error", async () => {
    const { deleteProfiles } = require("@/lib/api/profile");
    deleteProfiles.mockRejectedValueOnce(new Error("Delete error"));

    const request = new NextRequest("http://localhost/api/v1/profile", {
      method: "DELETE"
    });

    const response = await DELETE(request);

    expect(response.status).toBe(400);
  });
});

