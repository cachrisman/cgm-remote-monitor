/**
 * @jest-environment node
 */

import { NextResponse } from "next/server";

import { GET } from "../route";
import { createNightscoutClient } from "@/lib/nightscout-client";

jest.mock("@/lib/nightscout-client");

const createNightscoutClientMock = jest.mocked(createNightscoutClient);

describe("GET /api/status", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the latest entry and status when successful", async () => {
    const getRecentEntries = jest.fn().mockResolvedValue([
      {
        mgdl: 110,
        direction: "Flat",
        measuredAt: "2024-04-18T12:30:00.000Z"
      }
    ]);
    const getStatus = jest.fn().mockResolvedValue({
      state: "ok",
      devices: []
    });

    createNightscoutClientMock.mockReturnValue({
      getRecentEntries,
      getStatus
    });

    const response = await GET();
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

    expect(getRecentEntries).toHaveBeenCalledWith(1);
    expect(getStatus).toHaveBeenCalledTimes(1);
  });

  it("returns a 502 when the Nightscout API is unavailable", async () => {
    const error = new Error("offline");
    createNightscoutClientMock.mockReturnValue({
      getRecentEntries: jest.fn().mockRejectedValue(error),
      getStatus: jest.fn()
    });

    const response = await GET();
    expect(response.status).toBe(502);

    const payload = await response.json();
    expect(payload).toEqual({ error: "offline" });
  });
});
