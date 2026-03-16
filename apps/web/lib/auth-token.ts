/**
 * Client-side API token management.
 * Supports both access tokens and session JWTs.
 * 
 * Session JWTs are preferred as they don't require DB lookups on the server.
 */

const ACCESS_TOKEN_KEY = "nightscout_access_token";
const SESSION_TOKEN_KEY = "nightscout_session_token";
const SESSION_EXPIRY_KEY = "nightscout_session_expiry";

// =============================================================================
// ACCESS TOKEN (for initial authentication)
// =============================================================================

export function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredAccessToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
  } catch {
    // localStorage might be unavailable
  }
}

// =============================================================================
// SESSION TOKEN (JWT with embedded permissions)
// =============================================================================

export function getStoredSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const token = localStorage.getItem(SESSION_TOKEN_KEY);
    const expiry = localStorage.getItem(SESSION_EXPIRY_KEY);
    
    // Check if session is expired
    if (token && expiry) {
      const expiryTime = parseInt(expiry, 10);
      if (Date.now() < expiryTime) {
        return token;
      }
      // Session expired, clear it
      clearStoredSessionToken();
    }
    return null;
  } catch {
    return null;
  }
}

export function setStoredSessionToken(token: string, expiresIn: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SESSION_TOKEN_KEY, token);
    // Store expiry time (subtract 60s buffer for safety)
    const expiryTime = Date.now() + (expiresIn * 1000) - 60000;
    localStorage.setItem(SESSION_EXPIRY_KEY, String(expiryTime));
  } catch {
    // localStorage might be unavailable
  }
}

export function clearStoredSessionToken(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem(SESSION_EXPIRY_KEY);
  } catch {
    // localStorage might be unavailable
  }
}

// =============================================================================
// LEGACY COMPATIBILITY
// =============================================================================

/**
 * Get the stored token (for backward compatibility)
 * Returns session token if available, otherwise access token
 */
export function getStoredToken(): string | null {
  return getStoredSessionToken() || getStoredAccessToken();
}

/**
 * Store the token (for backward compatibility)
 * Stores as access token
 */
export function setStoredToken(token: string): void {
  setStoredAccessToken(token);
}

/**
 * Clear all stored tokens
 */
export function clearStoredToken(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    clearStoredSessionToken();
  } catch {
    // localStorage might be unavailable
  }
}

// =============================================================================
// AUTH HEADERS
// =============================================================================

/**
 * Create headers with authentication.
 * Prefers session JWT (Authorization header) over access token (api-secret header).
 */
export function createAuthHeaders(token?: string | null): HeadersInit {
  const headers: HeadersInit = {};
  
  // If a specific token is provided, use it
  if (token) {
    // Check if it looks like a JWT (has two dots)
    if (token.split(".").length === 3) {
      headers["Authorization"] = `Bearer ${token}`;
    } else {
      headers["api-secret"] = token;
    }
    return headers;
  }
  
  // Try session token first (JWT with embedded permissions - no DB lookup needed)
  const sessionToken = getStoredSessionToken();
  if (sessionToken) {
    headers["Authorization"] = `Bearer ${sessionToken}`;
    return headers;
  }
  
  // Fall back to access token
  const accessToken = getStoredAccessToken();
  if (accessToken) {
    headers["api-secret"] = accessToken;
  }
  
  return headers;
}

// =============================================================================
// TOKEN EXCHANGE
// =============================================================================

/**
 * Exchange an access token for a session JWT.
 * Session JWTs have embedded permissions and don't require DB lookups.
 * 
 * @param accessToken - The access token to exchange
 * @returns Session info or null if exchange failed
 */
export async function exchangeForSessionToken(accessToken: string): Promise<{
  token: string;
  subject: string;
  permissions: string[];
  expiresIn: number;
} | null> {
  try {
    const response = await fetch("/api/v1/authorize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-secret": accessToken,
      },
      body: JSON.stringify({ token: accessToken }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    
    if (data.token) {
      // Calculate expiresIn from exp
      const expiresIn = data.exp ? data.exp - Math.floor(Date.now() / 1000) : 8 * 60 * 60;
      
      return {
        token: data.token,
        subject: data.sub,
        permissions: data.permissionGroups?.[0] || [],
        expiresIn,
      };
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Authenticate with an access token and get a session JWT.
 * Stores both the access token (for re-auth) and session JWT (for requests).
 * 
 * @param accessToken - The access token (hashed API_SECRET or subject access token)
 * @returns True if authentication succeeded
 */
export async function authenticateAndGetSession(accessToken: string): Promise<boolean> {
  // Store the access token for potential re-authentication
  setStoredAccessToken(accessToken);
  
  // Try to exchange for a session token
  const session = await exchangeForSessionToken(accessToken);
  
  if (session) {
    setStoredSessionToken(session.token, session.expiresIn);
    return true;
  }
  
  return false;
}

// =============================================================================
// FETCH HELPERS
// =============================================================================

/**
 * Fetch with automatic token authentication
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const authHeaders = createAuthHeaders();
  
  return fetch(url, {
    ...options,
    headers: {
      ...authHeaders,
      ...options.headers,
    },
  });
}
