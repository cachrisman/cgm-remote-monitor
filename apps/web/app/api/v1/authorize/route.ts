import { type NextRequest, NextResponse } from "next/server";

import {
  extractApiSecret,
  verifyApiSecret,
  exchangeTokenForSession,
  generateSessionToken
} from "@/lib/api/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/v1/authorize
 * 
 * Exchange an access token for a session JWT.
 * The session JWT has embedded permissions and doesn't require DB lookups.
 * 
 * Request:
 * - Header: api-secret (access token or hashed API_SECRET)
 * - Or Body: { token: "access-token" }
 * 
 * Response:
 * {
 *   token: "jwt-session-token",
 *   sub: "subject-name",
 *   permissionGroups: [["perm1", "perm2"]],
 *   iat: 1234567890,
 *   exp: 1234567890
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Get token from header or body
    let accessToken = extractApiSecret(request);
    
    if (!accessToken) {
      try {
        const body = await request.json();
        accessToken = body.token || body.accessToken;
      } catch {
        // No body or invalid JSON
      }
    }

    if (!accessToken) {
      return NextResponse.json(
        { status: 401, message: "No access token provided" },
        { status: 401 }
      );
    }

    // Check if it's the admin API_SECRET
    if (verifyApiSecret(accessToken)) {
      const token = generateSessionToken("admin", ["*"]);
      const decoded = JSON.parse(
        Buffer.from(token.split(".")[1], "base64").toString()
      );
      
      return NextResponse.json({
        token,
        sub: "admin",
        permissionGroups: [["*"]],
        iat: decoded.iat,
        exp: decoded.exp
      });
    }

    // Try to exchange access token for session
    const session = await exchangeTokenForSession(accessToken);
    
    if (!session) {
      return NextResponse.json(
        { status: 401, message: "Invalid access token" },
        { status: 401 }
      );
    }

    // Decode the JWT to get iat/exp
    const decoded = JSON.parse(
      Buffer.from(session.token.split(".")[1], "base64").toString()
    );

    return NextResponse.json({
      token: session.token,
      sub: session.subject,
      permissionGroups: [session.permissions],
      iat: decoded.iat,
      exp: decoded.exp
    });
  } catch (error) {
    console.error("Authorization error:", error);
    return NextResponse.json(
      { status: 500, message: "Authorization failed" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/authorize
 * 
 * Legacy endpoint for authorizing with access token in URL or header.
 */
export async function GET(request: NextRequest) {
  const accessToken = request.nextUrl.searchParams.get("token") || extractApiSecret(request);
  
  if (!accessToken) {
    return NextResponse.json(
      { status: 401, message: "No access token provided" },
      { status: 401 }
    );
  }

  // Check if it's the admin API_SECRET
  if (verifyApiSecret(accessToken)) {
    const token = generateSessionToken("admin", ["*"]);
    const decoded = JSON.parse(
      Buffer.from(token.split(".")[1], "base64").toString()
    );
    
    return NextResponse.json({
      token,
      sub: "admin",
      permissionGroups: [["*"]],
      iat: decoded.iat,
      exp: decoded.exp
    });
  }

  // Try to exchange access token for session
  const session = await exchangeTokenForSession(accessToken);
  
  if (!session) {
    return NextResponse.json(
      { status: 401, message: "Invalid access token" },
      { status: 401 }
    );
  }

  // Decode the JWT to get iat/exp
  const decoded = JSON.parse(
    Buffer.from(session.token.split(".")[1], "base64").toString()
  );

  return NextResponse.json({
    token: session.token,
    sub: session.subject,
    permissionGroups: [session.permissions],
    iat: decoded.iat,
    exp: decoded.exp
  });
}

