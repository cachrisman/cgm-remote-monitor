/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from "next/server";

import * as auth from "@/lib/api/auth";
import { buildStatusSummary } from "@/lib/api/status-summary";

import { GET } from "../route";

jest.mock("@/lib/api/status-summary");
jest.mock("@/lib/api/auth");

const buildStatusSummaryMock = jest.mocked(buildStatusSummary);
const resolveAuthMock = jest.mocked(auth.resolveAuth);
const checkPermissionMock = jest.mocked(auth.checkPermission);

/**
 * Create a mock NextRequest for testing
 */
function createMockRequest(url = "http://localhost:3000/api/status"): NextRequest {
  return new NextRequest(url);
}

describe("GET /api/status", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: allow read access
    resolveAuthMock.mockResolvedValue({
      authorized: true,
      subject: "test-user",
      permissions: ["*:*:read"]
    });
    checkPermissionMock.mockReturnValue(true);
  });

  it("returns the latest entry and status when successful", async () => {
    buildStatusSummaryMock.mockResolvedValue({
      status: {
        state: "ok",
        devices: []
      },
      latestEntry: {
        mgdl: 110,
        direction: "Flat",
        measuredAt: "2024-04-18T12:30:00.000Z"
      }
    });

    const request = createMockRequest();
    const response = await GET(request);
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload).toEqual({
      latestEntry: {
        direction: "Flat",
        measuredAt: "2024-04-18T12:30:00.000Z",
        mgdl: 110
      },
      status: {
        devices: [],
        state: "ok"
      }
    });
    expect(buildStatusSummaryMock).toHaveBeenCalledTimes(1);
  });

  it("returns a 502 when the Nightscout API is unavailable", async () => {
    const error = new Error("offline");
    buildStatusSummaryMock.mockRejectedValue(error);

    const request = createMockRequest();
    const response = await GET(request);
    expect(response.status).toBe(502);

    const payload = await response.json();
    expect(payload).toEqual({ error: "offline" });
  });

  it("returns 401 when not authorized", async () => {
    checkPermissionMock.mockReturnValue(false);
    resolveAuthMock.mockResolvedValue({
      authorized: false,
      permissions: []
    });

    const request = createMockRequest();
    const response = await GET(request);
    expect(response.status).toBe(401);

    const payload = await response.json();
    expect(payload).toEqual({ status: 401, message: "Unauthorized" });
  });
});
