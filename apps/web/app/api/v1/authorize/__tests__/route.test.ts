/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

import { GET, POST } from "../route";

// Mock dependencies
jest.mock("@/lib/api/auth", () => ({
  extractApiSecret: jest.fn(() => null),
  verifyApiSecret: jest.fn(() => false),
  exchangeTokenForSession: jest.fn(() => null),
  generateSessionToken: jest.fn(() => 
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsInBlcm1pc3Npb25zIjpbIioiXSwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjE3MDAwMDM2MDB9.signature"
  )
}));

describe("POST /api/v1/authorize", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Reset default mock implementations
    const auth = require("@/lib/api/auth");
    auth.extractApiSecret.mockImplementation(() => null);
    auth.verifyApiSecret.mockImplementation(() => false);
    auth.exchangeTokenForSession.mockImplementation(() => Promise.resolve(null));
    auth.generateSessionToken.mockImplementation(
      () =>
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsInBlcm1pc3Npb25zIjpbIioiXSwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjE3MDAwMDM2MDB9.signature"
    );
  });

  it("returns 401 when no access token provided", async () => {
    const request = new NextRequest("http://localhost/api/v1/authorize", {
      method: "POST",
      body: JSON.stringify({})
    });
    const response = await POST(request);

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.message).toBe("No access token provided");
  });

  it("returns session token for valid API_SECRET header", async () => {
    const { extractApiSecret, verifyApiSecret, generateSessionToken } =
      require("@/lib/api/auth");
    
    extractApiSecret.mockReturnValueOnce("valid-api-secret");
    verifyApiSecret.mockReturnValueOnce(true);

    const request = new NextRequest("http://localhost/api/v1/authorize", {
      method: "POST",
      headers: {
        "api-secret": "valid-api-secret"
      }
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.token).toBeDefined();
    expect(payload.sub).toBe("admin");
    expect(payload.permissionGroups).toEqual([["*"]]);
    expect(payload.iat).toBeDefined();
    expect(payload.exp).toBeDefined();
  });

  it("returns session token for valid access token in body", async () => {
    const { extractApiSecret, verifyApiSecret, exchangeTokenForSession } =
      require("@/lib/api/auth");
    
    extractApiSecret.mockReturnValueOnce(null);
    verifyApiSecret.mockReturnValueOnce(false);
    exchangeTokenForSession.mockResolvedValueOnce({
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0dXNlciIsInBlcm1pc3Npb25zIjpbImFwaTplbnRyaWVzOnJlYWQiXSwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjE3MDAwMDM2MDB9.signature",
      subject: "testuser",
      permissions: ["api:entries:read"]
    });

    const request = new NextRequest("http://localhost/api/v1/authorize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ token: "valid-access-token" })
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.token).toBeDefined();
    expect(payload.sub).toBe("testuser");
    expect(payload.permissionGroups).toEqual([["api:entries:read"]]);
  });

  it("returns 401 for invalid access token", async () => {
    const { extractApiSecret, verifyApiSecret, exchangeTokenForSession } =
      require("@/lib/api/auth");
    
    extractApiSecret.mockReturnValueOnce("invalid-token");
    verifyApiSecret.mockReturnValueOnce(false);
    exchangeTokenForSession.mockResolvedValueOnce(null);

    const request = new NextRequest("http://localhost/api/v1/authorize", {
      method: "POST",
      headers: {
        "api-secret": "invalid-token"
      }
    });
    const response = await POST(request);

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.message).toBe("Invalid access token");
  });

  it("accepts accessToken in body as alternative to token", async () => {
    const { extractApiSecret, verifyApiSecret, exchangeTokenForSession } =
      require("@/lib/api/auth");
    
    extractApiSecret.mockReturnValueOnce(null);
    verifyApiSecret.mockReturnValueOnce(false);
    exchangeTokenForSession.mockResolvedValueOnce({
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0dXNlciIsInBlcm1pc3Npb25zIjpbImFwaTplbnRyaWVzOnJlYWQiXSwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjE3MDAwMDM2MDB9.signature",
      subject: "testuser",
      permissions: ["api:entries:read"]
    });

    const request = new NextRequest("http://localhost/api/v1/authorize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ accessToken: "valid-access-token" })
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(exchangeTokenForSession).toHaveBeenCalledWith("valid-access-token");
  });

  it("handles errors gracefully", async () => {
    const { extractApiSecret, verifyApiSecret, exchangeTokenForSession } =
      require("@/lib/api/auth");
    
    extractApiSecret.mockReturnValueOnce("some-token");
    verifyApiSecret.mockReturnValueOnce(false);
    exchangeTokenForSession.mockRejectedValueOnce(new Error("Database error"));

    const request = new NextRequest("http://localhost/api/v1/authorize", {
      method: "POST",
      headers: {
        "api-secret": "some-token"
      }
    });
    const response = await POST(request);

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.message).toBe("Authorization failed");
  });
});

describe("GET /api/v1/authorize", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Reset default mock implementations
    const auth = require("@/lib/api/auth");
    auth.extractApiSecret.mockImplementation(() => null);
    auth.verifyApiSecret.mockImplementation(() => false);
    auth.exchangeTokenForSession.mockImplementation(() => Promise.resolve(null));
    auth.generateSessionToken.mockImplementation(
      () =>
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsInBlcm1pc3Npb25zIjpbIioiXSwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjE3MDAwMDM2MDB9.signature"
    );
  });

  it("returns 401 when no access token provided", async () => {
    const request = new NextRequest("http://localhost/api/v1/authorize");
    const response = await GET(request);

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.message).toBe("No access token provided");
  });

  it("accepts token as query parameter", async () => {
    const { extractApiSecret, verifyApiSecret, exchangeTokenForSession } =
      require("@/lib/api/auth");
    
    extractApiSecret.mockReturnValueOnce(null);
    verifyApiSecret.mockReturnValueOnce(false);
    exchangeTokenForSession.mockResolvedValueOnce({
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0dXNlciIsInBlcm1pc3Npb25zIjpbImFwaTplbnRyaWVzOnJlYWQiXSwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjE3MDAwMDM2MDB9.signature",
      subject: "testuser",
      permissions: ["api:entries:read"]
    });

    const request = new NextRequest(
      "http://localhost/api/v1/authorize?token=my-access-token"
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(exchangeTokenForSession).toHaveBeenCalledWith("my-access-token");
  });

  it("prefers URL token over header", async () => {
    const { extractApiSecret, verifyApiSecret, exchangeTokenForSession } =
      require("@/lib/api/auth");
    
    extractApiSecret.mockReturnValueOnce("header-token");
    verifyApiSecret.mockReturnValueOnce(false);
    exchangeTokenForSession.mockResolvedValueOnce({
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0dXNlciIsInBlcm1pc3Npb25zIjpbImFwaTplbnRyaWVzOnJlYWQiXSwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjE3MDAwMDM2MDB9.signature",
      subject: "testuser",
      permissions: ["api:entries:read"]
    });

    const request = new NextRequest(
      "http://localhost/api/v1/authorize?token=url-token"
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    // URL token should be used
    expect(verifyApiSecret).toHaveBeenCalledWith("url-token");
  });

  it("returns session token for valid API_SECRET", async () => {
    const { extractApiSecret, verifyApiSecret, generateSessionToken } =
      require("@/lib/api/auth");
    
    extractApiSecret.mockReturnValueOnce("valid-api-secret");
    verifyApiSecret.mockReturnValueOnce(true);

    const request = new NextRequest("http://localhost/api/v1/authorize", {
      headers: {
        "api-secret": "valid-api-secret"
      }
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.token).toBeDefined();
    expect(payload.sub).toBe("admin");
    expect(payload.permissionGroups).toEqual([["*"]]);
  });

  it("returns 401 for invalid access token", async () => {
    const { extractApiSecret, verifyApiSecret, exchangeTokenForSession } =
      require("@/lib/api/auth");
    
    extractApiSecret.mockReturnValueOnce("invalid-token");
    verifyApiSecret.mockReturnValueOnce(false);
    exchangeTokenForSession.mockResolvedValueOnce(null);

    const request = new NextRequest("http://localhost/api/v1/authorize", {
      headers: {
        "api-secret": "invalid-token"
      }
    });
    const response = await GET(request);

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.message).toBe("Invalid access token");
  });
});

