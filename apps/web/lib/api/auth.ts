import crypto from 'crypto';

import jwt, { type SignOptions } from 'jsonwebtoken';
import { type NextRequest, NextResponse } from 'next/server';

import {
  findSubject,
  resolveSubjectAndPermissions,
  getRolesPermissions
} from './auth-storage';

import type { StringValue } from 'ms';

// Types
export type AuthResult = {
  authorized: boolean;
  subject?: string;
  permissions: string[];
  token?: string;
};

export type PermissionCheck = (permission: string) => boolean;

// Get environment configuration
function getApiSecret(): string | undefined {
  return process.env.API_SECRET;
}

function getJwtSecret(): string {
  // Use API_SECRET as JWT signing key if no separate JWT_SECRET is set
  return process.env.JWT_SECRET || process.env.API_SECRET || 'default-jwt-secret';
}

// Hash utilities
function sha1(data: string): string {
  return crypto.createHash('sha1').update(data, 'utf-8').digest('hex').toLowerCase();
}

function sha512(data: string): string {
  return crypto.createHash('sha512').update(data, 'utf-8').digest('hex').toLowerCase();
}

/**
 * Extract API secret from request
 * Checks: api-secret header, secret query param, or secret in body
 */
export function extractApiSecret(request: NextRequest): string | null {
  // Check header first
  const headerSecret = request.headers.get('api-secret');
  if (headerSecret) {
    return headerSecret;
  }

  // Check query parameter
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (querySecret) {
    return querySecret;
  }

  return null;
}

/**
 * Extract JWT token from request
 * Checks: Authorization Bearer header, token query param
 */
export function extractJWT(request: NextRequest): string | null {
  // Check Authorization header
  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      return parts[1];
    }
  }

  // Check query parameter
  const queryToken = request.nextUrl.searchParams.get('token');
  if (queryToken) {
    return queryToken;
  }

  return null;
}

/**
 * Verify API secret against stored API_SECRET
 * Returns true if the secret matches (either as SHA1 or SHA512 hash)
 */
export function verifyApiSecret(secret: string): boolean {
  const apiSecret = getApiSecret();
  if (!apiSecret || apiSecret.length < 12) {
    return false;
  }

  const secretLower = secret.toLowerCase();
  const sha1Hash = sha1(apiSecret);
  const sha512Hash = sha512(apiSecret);

  // Check if the provided secret matches either hash
  return secretLower === sha1Hash || secret === sha512Hash;
}

/**
 * Verify and decode JWT token
 * Returns the decoded payload or null if invalid
 */
type JWTPayload = {
  accessToken?: string;
  sub?: string;
  permissions?: string[];  // Embedded permissions for session tokens
  exp?: number;
  iat?: number;
};

export function verifyJWT(token: string): JWTPayload | null {
  try {
    const jwtSecret = getJwtSecret();
    const decoded = jwt.verify(token, jwtSecret);
    if (typeof decoded === 'object' && decoded !== null) {
      return decoded;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Sign a JWT token
 */
export function signJWT(payload: object, expiresIn: StringValue = '8h'): string {
  const jwtSecret = getJwtSecret();
  const options: SignOptions = { expiresIn };
  return jwt.sign(payload, jwtSecret, options);
}

/**
 * Get default roles from environment
 */
function getDefaultRoleNames(): string[] {
  const defaultRoles = process.env.AUTH_DEFAULT_ROLES || 'denied';
  return defaultRoles.split(/[,: ]/).map(r => r.trim()).filter(Boolean);
}

/**
 * Get default permissions when no auth is provided
 * 
 * By default, authentication is required (denied).
 * Set AUTH_DEFAULT_ROLES=readable to allow public read access.
 */
async function getDefaultPermissions(): Promise<string[]> {
  const roleNames = getDefaultRoleNames();
  
  // Try to get permissions from database roles first
  try {
    const permissions = await getRolesPermissions(roleNames);
    if (permissions.length > 0) {
      return permissions;
    }
  } catch {
    // Fall back to hardcoded roles if DB unavailable
  }

  // Fallback hardcoded role permissions
  const rolePermissions: Record<string, string[]> = {
    'admin': ['*'],
    'denied': [],
    'status-only': ['api:status:read'],
    'readable': ['*:*:read'],
    'careportal': ['api:treatments:create'],
    'devicestatus-upload': ['api:devicestatus:create'],
    'activity': ['api:activity:create']
  };

  const permissions: string[] = [];
  
  for (const roleName of roleNames) {
    if (rolePermissions[roleName]) {
      permissions.push(...rolePermissions[roleName]);
    }
  }

  return permissions;
}

/**
 * Resolve authentication from request
 * Returns auth result with permissions
 * 
 * Authentication methods (in order of precedence):
 * 1. API_SECRET (hashed) - grants admin (*) permissions
 * 2. JWT token containing accessToken - resolves subject from DB
 * 3. Access token (in api-secret header, secret query, or token query) - resolves subject from DB
 * 4. No auth - uses default permissions (AUTH_DEFAULT_ROLES env)
 */
export async function resolveAuth(request: NextRequest): Promise<AuthResult> {
  const apiSecret = extractApiSecret(request);
  const jwtToken = extractJWT(request);
  
  // Check API secret first (grants admin access) - skip DB query if valid
  if (apiSecret && verifyApiSecret(apiSecret)) {
    return {
      authorized: true,
      subject: 'admin',
      permissions: ['*']
    };
  }

  // Get default permissions (only if we haven't already returned)
  let defaultPermissions: string[] = [];
  try {
    const defaultPermsStart = Date.now();
    defaultPermissions = await getDefaultPermissions();
    const defaultPermsTime = Date.now() - defaultPermsStart;
    if (defaultPermsTime > 1000) {
      console.warn(`[auth] Slow getDefaultPermissions: ${defaultPermsTime}ms`);
    }
  } catch (error) {
    console.error('[auth] Error getting default permissions:', error);
    // Fallback to empty permissions if DB lookup fails
    defaultPermissions = [];
  }

  // Check JWT token
  if (jwtToken) {
    const decoded = verifyJWT(jwtToken);
    if (decoded) {
      // If JWT has embedded permissions, use them directly (no DB lookup needed)
      if (decoded.permissions && decoded.sub) {
        const combinedPermissions = [...new Set([...decoded.permissions, ...defaultPermissions])];
        return {
          authorized: true,
          subject: decoded.sub,
          permissions: combinedPermissions,
          token: jwtToken
        };
      }
      
      // Legacy JWT with accessToken - look up subject from DB
      if (decoded.accessToken) {
        const resolved = await resolveSubjectAndPermissions(decoded.accessToken);
        if (resolved.subject) {
          const combinedPermissions = [...new Set([...resolved.permissions, ...defaultPermissions])];
          return {
            authorized: true,
            subject: resolved.subject.name,
            permissions: combinedPermissions,
            token: jwtToken
          };
        }
      }
      
      // JWT without accessToken or permissions - grant default read access
      return {
        authorized: true,
        subject: decoded.sub || 'token-user',
        permissions: ['*:*:read', ...defaultPermissions],
        token: jwtToken
      };
    }
    
    // JWT verification failed - try treating the token as an access token
    // This supports legacy clients that pass raw access tokens via ?token=
    const subject = await findSubject(jwtToken);
    if (subject) {
      const resolved = await resolveSubjectAndPermissions(jwtToken);
      const combinedPermissions = [...new Set([...resolved.permissions, ...defaultPermissions])];
      return {
        authorized: true,
        subject: subject.name,
        permissions: combinedPermissions
      };
    }
  }

  // Check if api-secret header contains an access token (not the API_SECRET)
  if (apiSecret) {
    // Try to find a subject matching this token
    const subject = await findSubject(apiSecret);
    if (subject) {
      const resolved = await resolveSubjectAndPermissions(apiSecret);
      const combinedPermissions = [...new Set([...resolved.permissions, ...defaultPermissions])];
      return {
        authorized: true,
        subject: subject.name,
        permissions: combinedPermissions
      };
    }
  }

  // No valid auth - return default permissions
  return {
    authorized: false,
    permissions: defaultPermissions
  };
}

/**
 * Create a permission checker function
 */
export function createPermissionChecker(permissions: string[]): PermissionCheck {
  return (permission: string) => {
    return checkPermission(permissions, permission);
  };
}

/**
 * Check if a permission is granted by the given permissions list
 * Supports shiro-style wildcards: *:*:read matches api:entries:read
 */
export function checkPermission(grantedPermissions: string[], requiredPermission: string): boolean {
  const requiredParts = requiredPermission.split(':');
  
  for (const granted of grantedPermissions) {
    // Full wildcard
    if (granted === '*') {
      return true;
    }

    const grantedParts = granted.split(':');
    let matches = true;

    for (let i = 0; i < Math.max(requiredParts.length, grantedParts.length); i++) {
      const grantedPart = grantedParts[i] || '';
      const requiredPart = requiredParts[i] || '';

      if (grantedPart === '*') {
        // Wildcard matches anything at this level
        continue;
      }

      if (grantedPart !== requiredPart) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return true;
    }
  }

  return false;
}

/**
 * Express-style middleware factory for permission checking
 * Returns a function that can be used to wrap route handlers
 */
export function isPermitted(permission: string) {
  return async function checkPermissionMiddleware(
    request: NextRequest,
    handler: (request: NextRequest) => Promise<NextResponse>
  ): Promise<NextResponse> {
    const auth = await resolveAuth(request);
    
    if (!checkPermission(auth.permissions, permission)) {
      return NextResponse.json(
        { 
          status: 401,
          message: 'Unauthorized',
          description: 'Invalid/Missing'
        },
        { status: 401 }
      );
    }

    return handler(request);
  };
}

/**
 * Higher-order function to protect a route handler with permission check
 */
export function withAuth(permission: string) {
  return function(
    handler: (request: NextRequest) => Promise<NextResponse>
  ): (request: NextRequest) => Promise<NextResponse> {
    return async (request: NextRequest) => {
      const auth = await resolveAuth(request);
      
      if (!checkPermission(auth.permissions, permission)) {
        return NextResponse.json(
          { 
            status: 401,
            message: 'Unauthorized',
            description: 'Invalid/Missing'
          },
          { status: 401 }
        );
      }

      return handler(request);
    };
  };
}

/**
 * Generate authorization info for status response
 */
export async function getAuthorizationInfo(request: NextRequest): Promise<object | null> {
  const apiSecret = extractApiSecret(request);
  const jwtToken = extractJWT(request);

  if (!apiSecret && !jwtToken) {
    return null;
  }

  const auth = await resolveAuth(request);
  
  if (!auth.authorized) {
    return null;
  }

  return {
    sub: auth.subject,
    permissionGroups: [auth.permissions]
  };
}

/**
 * Generate a JWT for an authenticated subject (legacy format with accessToken)
 */
export function generateSubjectToken(accessToken: string): string {
  return signJWT({ accessToken });
}

/**
 * Generate a session JWT with embedded permissions (no DB lookup needed on subsequent requests)
 * 
 * @param subject - The subject name
 * @param permissions - Array of permissions to embed in the token
 * @param expiresIn - Token expiration (default: 8h)
 * @returns JWT string
 */
export function generateSessionToken(
  subject: string, 
  permissions: string[],
  expiresIn: StringValue = '8h'
): string {
  return signJWT({ sub: subject, permissions }, expiresIn);
}

/**
 * Exchange an access token for a session JWT with embedded permissions.
 * The session JWT can be used for subsequent requests without DB lookups.
 * 
 * @param accessToken - The access token to exchange
 * @returns Object with token and subject info, or null if invalid
 */
export async function exchangeTokenForSession(accessToken: string): Promise<{
  token: string;
  subject: string;
  permissions: string[];
  expiresIn: number;
} | null> {
  // First, verify the access token
  const resolved = await resolveSubjectAndPermissions(accessToken);
  
  if (!resolved.subject) {
    return null;
  }

  // Get default permissions to merge
  const defaultPermissions = await getDefaultPermissions();
  const combinedPermissions = [...new Set([...resolved.permissions, ...defaultPermissions])];

  // Generate session token (8 hours by default)
  const expiresIn = 8 * 60 * 60; // 8 hours in seconds
  const token = generateSessionToken(resolved.subject.name, combinedPermissions);

  return {
    token,
    subject: resolved.subject.name,
    permissions: combinedPermissions,
    expiresIn
  };
}

