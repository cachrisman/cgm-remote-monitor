// Mock auth-storage before importing auth (to avoid MongoDB import issues)
jest.mock("../auth-storage", () => ({
  findSubject: jest.fn(),
  resolveSubjectAndPermissions: jest.fn(),
  getRolesPermissions: jest.fn(() => ({}))
}));

// Mock the crypto module
jest.mock("crypto", () => ({
  createHash: jest.fn(() => ({
    update: jest.fn(() => ({
      digest: jest.fn((format: string) => {
        // Return predictable hashes for testing
        return format === "hex" ? "testsha1hash" : "testsha512hash";
      })
    }))
  }))
}));

import {
  extractApiSecret,
  extractJWT,
  verifyApiSecret,
  checkPermission,
  createPermissionChecker
} from "../auth";

// Helper to create mock NextRequest objects
function createMockRequest(url: string, options: { headers?: Record<string, string> } = {}) {
  const urlObj = new URL(url);
  
  return {
    headers: {
      get: (name: string) => options.headers?.[name.toLowerCase()] ?? options.headers?.[name] ?? null
    },
    nextUrl: {
      searchParams: urlObj.searchParams
    }
  } as Parameters<typeof extractApiSecret>[0];
}

describe("Authentication Middleware", () => {
  describe("extractApiSecret", () => {
    it("extracts api-secret from header", () => {
      const request = createMockRequest("http://localhost/api/test", {
        headers: {
          "api-secret": "my-secret-hash"
        }
      });
      
      const secret = extractApiSecret(request);
      expect(secret).toBe("my-secret-hash");
    });

    it("extracts secret from query parameter", () => {
      const request = createMockRequest("http://localhost/api/test?secret=query-secret");
      
      const secret = extractApiSecret(request);
      expect(secret).toBe("query-secret");
    });

    it("prefers header over query parameter", () => {
      const request = createMockRequest("http://localhost/api/test?secret=query-secret", {
        headers: {
          "api-secret": "header-secret"
        }
      });
      
      const secret = extractApiSecret(request);
      expect(secret).toBe("header-secret");
    });

    it("returns null when no secret is present", () => {
      const request = createMockRequest("http://localhost/api/test");
      
      const secret = extractApiSecret(request);
      expect(secret).toBeNull();
    });
  });

  describe("extractJWT", () => {
    it("extracts JWT from Authorization Bearer header", () => {
      const request = createMockRequest("http://localhost/api/test", {
        headers: {
          "Authorization": "Bearer my-jwt-token"
        }
      });
      
      const token = extractJWT(request);
      expect(token).toBe("my-jwt-token");
    });

    it("extracts token from query parameter", () => {
      const request = createMockRequest("http://localhost/api/test?token=query-token");
      
      const token = extractJWT(request);
      expect(token).toBe("query-token");
    });

    it("prefers header over query parameter", () => {
      const request = createMockRequest("http://localhost/api/test?token=query-token", {
        headers: {
          "Authorization": "Bearer header-token"
        }
      });
      
      const token = extractJWT(request);
      expect(token).toBe("header-token");
    });

    it("returns null for non-Bearer Authorization header", () => {
      const request = createMockRequest("http://localhost/api/test", {
        headers: {
          "Authorization": "Basic abc123"
        }
      });
      
      const token = extractJWT(request);
      expect(token).toBeNull();
    });

    it("returns null when no token is present", () => {
      const request = createMockRequest("http://localhost/api/test");
      
      const token = extractJWT(request);
      expect(token).toBeNull();
    });
  });

  describe("verifyApiSecret", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it("returns false when API_SECRET is not set", () => {
      delete process.env.API_SECRET;
      expect(verifyApiSecret("any-secret")).toBe(false);
    });

    it("returns false when API_SECRET is too short", () => {
      process.env.API_SECRET = "short";
      expect(verifyApiSecret("any-secret")).toBe(false);
    });

    it("returns true when secret matches SHA1 hash", () => {
      process.env.API_SECRET = "my-long-secret-12";
      // Our mock returns "testsha1hash" for SHA1
      expect(verifyApiSecret("testsha1hash")).toBe(true);
    });
  });

  describe("checkPermission", () => {
    it("grants all permissions with wildcard *", () => {
      expect(checkPermission(["*"], "api:entries:read")).toBe(true);
      expect(checkPermission(["*"], "api:treatments:create")).toBe(true);
      expect(checkPermission(["*"], "anything:goes:here")).toBe(true);
    });

    it("matches exact permission", () => {
      expect(checkPermission(["api:entries:read"], "api:entries:read")).toBe(true);
      expect(checkPermission(["api:entries:read"], "api:entries:write")).toBe(false);
    });

    it("matches wildcard at domain level", () => {
      expect(checkPermission(["*:entries:read"], "api:entries:read")).toBe(true);
      expect(checkPermission(["api:*:read"], "api:entries:read")).toBe(true);
      expect(checkPermission(["api:entries:*"], "api:entries:read")).toBe(true);
    });

    it("matches *:*:read pattern", () => {
      expect(checkPermission(["*:*:read"], "api:entries:read")).toBe(true);
      expect(checkPermission(["*:*:read"], "api:treatments:read")).toBe(true);
      expect(checkPermission(["*:*:read"], "api:entries:create")).toBe(false);
    });

    it("denies when no matching permission", () => {
      expect(checkPermission(["api:entries:read"], "api:treatments:read")).toBe(false);
      expect(checkPermission([], "api:entries:read")).toBe(false);
    });

    it("handles multiple permissions", () => {
      const permissions = ["api:entries:read", "api:treatments:create"];
      expect(checkPermission(permissions, "api:entries:read")).toBe(true);
      expect(checkPermission(permissions, "api:treatments:create")).toBe(true);
      expect(checkPermission(permissions, "api:devicestatus:read")).toBe(false);
    });
  });

  describe("createPermissionChecker", () => {
    it("creates a permission checker function", () => {
      const isPermitted = createPermissionChecker(["api:entries:read", "api:treatments:create"]);
      
      expect(isPermitted("api:entries:read")).toBe(true);
      expect(isPermitted("api:treatments:create")).toBe(true);
      expect(isPermitted("api:devicestatus:read")).toBe(false);
    });

    it("works with wildcard permissions", () => {
      const isPermitted = createPermissionChecker(["*"]);
      
      expect(isPermitted("api:entries:read")).toBe(true);
      expect(isPermitted("anything")).toBe(true);
    });
  });
});
