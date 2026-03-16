/**
 * Authorization storage - reads subjects and roles from MongoDB.
 * Ported from legacy lib/authorization/storage.js
 * 
 * Includes in-memory caching to avoid repeated DB queries.
 */

import crypto from "crypto";

import { getDb } from "../mongodb";

// Types
export interface AuthRole {
  _id?: string;
  name: string;
  permissions: string[];
  created_at?: string;
}

export interface AuthSubject {
  _id?: string;
  name: string;
  roles: string[];
  created_at?: string;
  // Computed fields (not stored in DB)
  accessToken?: string;
  accessTokenDigest?: string;
  digest?: string;
}

export interface ResolvedSubject extends AuthSubject {
  accessToken: string;
  accessTokenDigest: string;
  digest: string;
}

// =============================================================================
// CACHE CONFIGURATION
// =============================================================================

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// Cache TTL in milliseconds (default: 60 seconds)
const CACHE_TTL_MS = parseInt(process.env.AUTH_CACHE_TTL_MS || "60000", 10);

// In-memory cache
let rolesCache: CacheEntry<AuthRole[]> | null = null;
let subjectsCache: CacheEntry<ResolvedSubject[]> | null = null;

/**
 * Check if a cache entry is still valid
 */
function isCacheValid<T>(cache: CacheEntry<T> | null): cache is CacheEntry<T> {
  return cache !== null && Date.now() < cache.expiresAt;
}

/**
 * Clear the auth cache (useful for testing or after admin changes)
 */
export function clearAuthCache(): void {
  rolesCache = null;
  subjectsCache = null;
}

// =============================================================================
// DEFAULT ROLES
// =============================================================================

const DEFAULT_ROLES: AuthRole[] = [
  { name: "admin", permissions: ["*"] },
  { name: "denied", permissions: [] },
  { name: "status-only", permissions: ["api:status:read"] },
  { name: "readable", permissions: ["*:*:read"] },
  { name: "careportal", permissions: ["api:treatments:create"] },
  { name: "devicestatus-upload", permissions: ["api:devicestatus:create"] },
  { name: "activity", permissions: ["api:activity:create"] },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getCollectionPrefix(): string {
  return process.env.MONGO_AUTHENTICATION_COLLECTIONS_PREFIX || "auth_";
}

function getSHA1(message: string): string {
  return crypto.createHash("sha1").update(message).digest("hex").toLowerCase();
}

function getApiSecret(): string {
  return process.env.API_SECRET || "";
}

function getApiSecretSHA1(): string {
  const apiSecret = getApiSecret();
  if (!apiSecret || apiSecret.length < 12) return "";
  return getSHA1(apiSecret);
}

/**
 * Generate a subject's digest hash (used for access token generation)
 * Matches legacy enclave.getSubjectHash: SHA-1(SHA-1(API_SECRET) + subjectId)
 */
function getSubjectDigest(subjectId: string): string {
  const apiSecretSHA1 = getApiSecretSHA1();
  if (!apiSecretSHA1) return "";
  
  return crypto
    .createHash("sha1")
    .update(apiSecretSHA1)
    .update(subjectId)
    .digest("hex")
    .toLowerCase();
}

// =============================================================================
// DATABASE ACCESS (with caching)
// =============================================================================

async function getRolesCollection() {
  const db = await getDb();
  const prefix = getCollectionPrefix();
  return db.collection<AuthRole>(`${prefix}roles`);
}

async function getSubjectsCollection() {
  const db = await getDb();
  const prefix = getCollectionPrefix();
  return db.collection<AuthSubject>(`${prefix}subjects`);
}

/**
 * Load all roles from database and merge with defaults (cached)
 */
export async function loadRoles(): Promise<AuthRole[]> {
  // Return cached data if valid
  if (isCacheValid(rolesCache)) {
    return rolesCache.data;
  }

  try {
    const collection = await getRolesCollection();
    const dbRoles = await collection.find({}).sort({ name: 1 }).toArray();
    
    const roles: AuthRole[] = dbRoles.map((doc) => ({
      _id: doc._id?.toString(),
      name: doc.name,
      permissions: doc.permissions || [],
      created_at: doc.created_at,
    }));

    // Add default roles if not present in DB
    for (const defaultRole of DEFAULT_ROLES) {
      if (!roles.find((r) => r.name === defaultRole.name)) {
        roles.push(defaultRole);
      }
    }

    const sortedRoles = roles.sort((a, b) => a.name.localeCompare(b.name));

    // Cache the result
    rolesCache = {
      data: sortedRoles,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };

    return sortedRoles;
  } catch (error) {
    console.error("Failed to load roles:", error);
    return [...DEFAULT_ROLES];
  }
}

/**
 * Load all subjects from database and compute access tokens (cached)
 */
export async function loadSubjects(): Promise<ResolvedSubject[]> {
  // Return cached data if valid
  if (isCacheValid(subjectsCache)) {
    return subjectsCache.data;
  }

  try {
    const collection = await getSubjectsCollection();
    const dbSubjects = await collection.find({}).sort({ name: 1 }).toArray();
    const apiSecretSHA1 = getApiSecretSHA1();

    if (!apiSecretSHA1) {
      console.warn("No valid API_SECRET set (must be >= 12 chars), access tokens won't work");
      return [];
    }

    const subjects = dbSubjects.map((doc) => {
      const id = doc._id?.toString() || "";
      const digest = getSubjectDigest(id);
      
      // Generate access token matching legacy format
      const abbrev = (doc.name || "")
        .toLowerCase()
        .replace(/[\W]/g, "")
        .substring(0, 10);
      const accessToken = `${abbrev}-${digest.substring(0, 16)}`;
      const accessTokenDigest = getSHA1(accessToken);

      return {
        _id: id,
        name: doc.name,
        roles: doc.roles || [],
        created_at: doc.created_at,
        accessToken,
        accessTokenDigest,
        digest,
      };
    });

    // Cache the result
    subjectsCache = {
      data: subjects,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };

    return subjects;
  } catch (error) {
    console.error("Failed to load subjects:", error);
    return [];
  }
}

// =============================================================================
// LOOKUP FUNCTIONS
// =============================================================================

export async function findRole(roleName: string): Promise<AuthRole | null> {
  const roles = await loadRoles();
  return roles.find((r) => r.name === roleName) || null;
}

export async function getRolePermissions(roleName: string): Promise<string[]> {
  const role = await findRole(roleName);
  return role?.permissions || [];
}

export async function getRolesPermissions(roleNames: string[]): Promise<string[]> {
  const roles = await loadRoles();
  const permissions: string[] = [];

  for (const roleName of roleNames) {
    const role = roles.find((r) => r.name === roleName);
    if (role) {
      permissions.push(...role.permissions);
    }
  }

  return [...new Set(permissions)];
}

/**
 * Find a subject by access token
 * 
 * Token can be:
 * - Full access token (abbrev-digest)
 * - SHA1 hash of access token
 * - Last 16+ chars of the digest
 */
export async function findSubject(accessToken: string): Promise<ResolvedSubject | null> {
  if (!accessToken) return null;

  const subjects = await loadSubjects();
  const tokens = Array.isArray(accessToken) ? accessToken : [accessToken];

  for (const token of tokens) {
    const found = findSubjectByToken(subjects, token);
    if (found) return found;
  }

  return null;
}

function findSubjectByToken(
  subjects: ResolvedSubject[],
  token: string
): ResolvedSubject | null {
  const splitToken = token.split("-");
  const prefix = splitToken.length > 1 ? splitToken[splitToken.length - 1] : token;

  if (prefix.length < 16) {
    return null;
  }

  return (
    subjects.find((subject) => {
      if (subject.accessTokenDigest.startsWith(token)) {
        return true;
      }
      if (subject.digest.startsWith(prefix)) {
        return true;
      }
      return false;
    }) || null
  );
}

export async function resolveSubjectAndPermissions(
  accessToken: string
): Promise<{ subject: ResolvedSubject | null; permissions: string[] }> {
  const subject = await findSubject(accessToken);

  if (!subject) {
    return { subject: null, permissions: [] };
  }

  const permissions = await getRolesPermissions(subject.roles);
  return { subject, permissions };
}

export async function doesAccessTokenExist(accessToken: string): Promise<boolean> {
  const subject = await findSubject(accessToken);
  return subject !== null;
}
