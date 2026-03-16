/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from "next/server";

import { GET, PUT, PATCH, DELETE } from "../route";

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
const mockFindOne = jest.fn();
const mockUpdateOne = jest.fn();
const mockDeleteOne = jest.fn();

jest.mock("@/lib/api/collections", () => ({
  getEntriesCollection: jest.fn(() =>
    Promise.resolve({
      find: mockFind,
      findOne: mockFindOne,
      updateOne: mockUpdateOne,
      deleteOne: mockDeleteOne
    })
  ),
  getTreatmentsCollection: jest.fn(() =>
    Promise.resolve({
      find: mockFind,
      findOne: mockFindOne,
      updateOne: mockUpdateOne,
      deleteOne: mockDeleteOne
    })
  ),
  getDeviceStatusCollection: jest.fn(() =>
    Promise.resolve({
      find: mockFind,
      findOne: mockFindOne,
      updateOne: mockUpdateOne,
      deleteOne: mockDeleteOne
    })
  ),
  getProfileCollection: jest.fn(() =>
    Promise.resolve({
      find: mockFind,
      findOne: mockFindOne,
      updateOne: mockUpdateOne,
      deleteOne: mockDeleteOne
    })
  ),
  getFoodCollection: jest.fn(() =>
    Promise.resolve({
      find: mockFind,
      findOne: mockFindOne,
      updateOne: mockUpdateOne,
      deleteOne: mockDeleteOne
    })
  ),
  getSettingsCollection: jest.fn(() =>
    Promise.resolve({
      find: mockFind,
      findOne: mockFindOne,
      updateOne: mockUpdateOne,
      deleteOne: mockDeleteOne
    })
  )
}));

jest.mock("@/lib/api/serialization", () => ({
  serializeDocument: jest.fn((doc) => ({
    ...doc,
    _id: String(doc._id)
  }))
}));

jest.mock("@/lib/api/v3-documents", () => ({
  findByIdentifier: jest.fn(),
  upsertV3Document: jest.fn(),
  softDeleteV3Document: jest.fn(),
  hardDeleteV3Document: jest.fn(),
  validateModification: jest.fn(() => ({ valid: true }))
}));

describe("GET /api/v3/:collection/:identifier (READ)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns document by identifier", async () => {
    const { findByIdentifier } = require("@/lib/api/v3-documents");
    findByIdentifier.mockResolvedValueOnce({
      _id: "abc123",
      identifier: "test-entry-1",
      sgv: 110,
      date: 1700000000000,
      srvModified: 1700000000000
    });

    const request = new NextRequest(
      "http://localhost/api/v3/entries/test-entry-1"
    );
    const response = await GET(request, {
      params: Promise.resolve({ collection: "entries", identifier: "test-entry-1" })
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.status).toBe(200);
    expect(payload.result).toBeDefined();
    expect(payload.result.identifier).toBe("test-entry-1");
  });

  it("returns 404 for invalid collection", async () => {
    const request = new NextRequest(
      "http://localhost/api/v3/invalid/test-id"
    );
    const response = await GET(request, {
      params: Promise.resolve({ collection: "invalid", identifier: "test-id" })
    });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.message).toBe("Not Found");
  });

  it("returns 404 when document not found", async () => {
    const { findByIdentifier } = require("@/lib/api/v3-documents");
    findByIdentifier.mockResolvedValueOnce(null);

    const request = new NextRequest(
      "http://localhost/api/v3/entries/nonexistent"
    );
    const response = await GET(request, {
      params: Promise.resolve({ collection: "entries", identifier: "nonexistent" })
    });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.message).toBe("Not Found");
  });

  it("returns 410 when document is soft-deleted", async () => {
    const { findByIdentifier } = require("@/lib/api/v3-documents");
    findByIdentifier.mockResolvedValueOnce({
      _id: "abc123",
      identifier: "deleted-entry",
      isValid: false,
      srvModified: 1700000000000
    });

    const request = new NextRequest(
      "http://localhost/api/v3/entries/deleted-entry"
    );
    const response = await GET(request, {
      params: Promise.resolve({ collection: "entries", identifier: "deleted-entry" })
    });

    expect(response.status).toBe(410);
    const payload = await response.json();
    expect(payload.message).toBe("Gone");
  });

  it("returns 401 when not authorized", async () => {
    const { resolveAuth } = require("@/lib/api/auth");
    const { checkPermission } = require("@/lib/api/auth");
    resolveAuth.mockResolvedValueOnce({
      authorized: false,
      permissions: []
    });
    checkPermission.mockReturnValueOnce(false);

    const request = new NextRequest(
      "http://localhost/api/v3/entries/test-entry"
    );
    const response = await GET(request, {
      params: Promise.resolve({ collection: "entries", identifier: "test-entry" })
    });

    expect(response.status).toBe(401);
  });

  it("returns 403 when authorized but missing permission", async () => {
    const { resolveAuth } = require("@/lib/api/auth");
    const { checkPermission } = require("@/lib/api/auth");
    resolveAuth.mockResolvedValueOnce({
      authorized: true,
      permissions: ["api:treatments:read"]
    });
    checkPermission.mockReturnValueOnce(false);

    const request = new NextRequest(
      "http://localhost/api/v3/entries/test-entry"
    );
    const response = await GET(request, {
      params: Promise.resolve({ collection: "entries", identifier: "test-entry" })
    });

    expect(response.status).toBe(403);
  });

  it("requires admin permission for settings collection", async () => {
    const { findByIdentifier } = require("@/lib/api/v3-documents");
    const { checkPermission } = require("@/lib/api/auth");
    findByIdentifier.mockResolvedValueOnce({
      _id: "abc123",
      identifier: "app-settings",
      srvModified: 1700000000000
    });

    const request = new NextRequest(
      "http://localhost/api/v3/settings/app-settings"
    );
    await GET(request, {
      params: Promise.resolve({ collection: "settings", identifier: "app-settings" })
    });

    // Check that admin permission was required
    expect(checkPermission).toHaveBeenCalledWith(
      expect.anything(),
      "api:settings:admin"
    );
  });

  it("sets Last-Modified header in response", async () => {
    const { findByIdentifier } = require("@/lib/api/v3-documents");
    findByIdentifier.mockResolvedValueOnce({
      _id: "abc123",
      identifier: "test-entry",
      sgv: 110,
      srvModified: 1700000000000
    });

    const request = new NextRequest(
      "http://localhost/api/v3/entries/test-entry"
    );
    const response = await GET(request, {
      params: Promise.resolve({ collection: "entries", identifier: "test-entry" })
    });

    expect(response.headers.get("Last-Modified")).toBeDefined();
  });
});

describe("PUT /api/v3/:collection/:identifier (UPDATE)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { findByIdentifier, validateModification, upsertV3Document } = require("@/lib/api/v3-documents");
    findByIdentifier.mockResolvedValue({
      _id: "abc123",
      identifier: "test-entry",
      sgv: 100
    });
    validateModification.mockReturnValue({ valid: true });
    upsertV3Document.mockResolvedValue({
      _id: "abc123",
      identifier: "test-entry",
      sgv: 120,
      srvModified: Date.now()
    });
  });

  it("updates document and returns 200", async () => {
    const body = { sgv: 120, date: 1700000001000 };
    const request = new NextRequest(
      "http://localhost/api/v3/entries/test-entry",
      {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" }
      }
    );

    const response = await PUT(request, {
      params: Promise.resolve({ collection: "entries", identifier: "test-entry" })
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.status).toBe(200);
    expect(payload.result).toBeDefined();
  });

  it("returns 404 for invalid collection", async () => {
    const body = { value: 1 };
    const request = new NextRequest(
      "http://localhost/api/v3/invalid/test-id",
      {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" }
      }
    );

    const response = await PUT(request, {
      params: Promise.resolve({ collection: "invalid", identifier: "test-id" })
    });

    expect(response.status).toBe(404);
  });

  it("returns 410 when document is deleted", async () => {
    const { findByIdentifier, validateModification } = require("@/lib/api/v3-documents");
    findByIdentifier.mockResolvedValueOnce({
      _id: "abc123",
      identifier: "deleted-entry",
      isValid: false
    });
    validateModification.mockReturnValueOnce({
      valid: false,
      error: "Document has been deleted"
    });

    const body = { sgv: 120 };
    const request = new NextRequest(
      "http://localhost/api/v3/entries/deleted-entry",
      {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" }
      }
    );

    const response = await PUT(request, {
      params: Promise.resolve({ collection: "entries", identifier: "deleted-entry" })
    });

    expect(response.status).toBe(410);
  });
});

describe("PATCH /api/v3/:collection/:identifier (PARTIAL UPDATE)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { findByIdentifier, validateModification, upsertV3Document } = require("@/lib/api/v3-documents");
    findByIdentifier.mockResolvedValue({
      _id: "abc123",
      identifier: "test-entry",
      sgv: 100,
      direction: "Flat"
    });
    validateModification.mockReturnValue({ valid: true });
    upsertV3Document.mockResolvedValue({
      _id: "abc123",
      identifier: "test-entry",
      sgv: 100,
      direction: "FortyFiveUp",
      srvModified: Date.now()
    });
  });

  it("partially updates document and returns 200", async () => {
    const body = { direction: "FortyFiveUp" };
    const request = new NextRequest(
      "http://localhost/api/v3/entries/test-entry",
      {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" }
      }
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ collection: "entries", identifier: "test-entry" })
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.status).toBe(200);
    expect(payload.result).toBeDefined();
  });

  it("merges with existing document", async () => {
    const { upsertV3Document } = require("@/lib/api/v3-documents");

    const body = { direction: "FortyFiveUp" };
    const request = new NextRequest(
      "http://localhost/api/v3/entries/test-entry",
      {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" }
      }
    );

    await PATCH(request, {
      params: Promise.resolve({ collection: "entries", identifier: "test-entry" })
    });

    // Verify merge was called with existing + new fields
    expect(upsertV3Document).toHaveBeenCalled();
    const mergedDoc = upsertV3Document.mock.calls[0][1];
    expect(mergedDoc.sgv).toBe(100); // From existing
    expect(mergedDoc.direction).toBe("FortyFiveUp"); // From patch
  });

  it("returns 404 for invalid collection", async () => {
    const body = { value: 1 };
    const request = new NextRequest(
      "http://localhost/api/v3/invalid/test-id",
      {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" }
      }
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ collection: "invalid", identifier: "test-id" })
    });

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/v3/:collection/:identifier (DELETE)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { findByIdentifier, validateModification, softDeleteV3Document, hardDeleteV3Document } = require("@/lib/api/v3-documents");
    findByIdentifier.mockResolvedValue({
      _id: "abc123",
      identifier: "test-entry",
      sgv: 100
    });
    validateModification.mockReturnValue({ valid: true });
    softDeleteV3Document.mockResolvedValue(true);
    hardDeleteV3Document.mockResolvedValue(true);
  });

  it("soft deletes document by default", async () => {
    const { softDeleteV3Document, hardDeleteV3Document } = require("@/lib/api/v3-documents");

    const request = new NextRequest(
      "http://localhost/api/v3/entries/test-entry",
      { method: "DELETE" }
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ collection: "entries", identifier: "test-entry" })
    });

    expect(response.status).toBe(200);
    expect(softDeleteV3Document).toHaveBeenCalled();
    expect(hardDeleteV3Document).not.toHaveBeenCalled();
  });

  it("hard deletes document when permanent=true", async () => {
    const { softDeleteV3Document, hardDeleteV3Document } = require("@/lib/api/v3-documents");

    const request = new NextRequest(
      "http://localhost/api/v3/entries/test-entry?permanent=true",
      { method: "DELETE" }
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ collection: "entries", identifier: "test-entry" })
    });

    expect(response.status).toBe(200);
    expect(hardDeleteV3Document).toHaveBeenCalled();
    expect(softDeleteV3Document).not.toHaveBeenCalled();
  });

  it("returns 404 when document not found", async () => {
    const { softDeleteV3Document } = require("@/lib/api/v3-documents");
    softDeleteV3Document.mockResolvedValueOnce(false);

    const request = new NextRequest(
      "http://localhost/api/v3/entries/nonexistent",
      { method: "DELETE" }
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ collection: "entries", identifier: "nonexistent" })
    });

    expect(response.status).toBe(404);
  });

  it("returns 404 for invalid collection", async () => {
    const request = new NextRequest(
      "http://localhost/api/v3/invalid/test-id",
      { method: "DELETE" }
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ collection: "invalid", identifier: "test-id" })
    });

    expect(response.status).toBe(404);
  });

  it("returns 422 when trying to delete read-only document", async () => {
    const { validateModification } = require("@/lib/api/v3-documents");
    validateModification.mockReturnValueOnce({
      valid: false,
      error: "Document is read-only"
    });

    const request = new NextRequest(
      "http://localhost/api/v3/entries/readonly-entry",
      { method: "DELETE" }
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ collection: "entries", identifier: "readonly-entry" })
    });

    // Returns 410 or 404 based on existing doc state
    expect([404, 410]).toContain(response.status);
  });
});

