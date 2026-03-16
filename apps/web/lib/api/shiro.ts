/**
 * Shiro-style permission checking for role-based access control.
 * Ported from lib/authorization/storage.js shiro-trie implementation.
 * 
 * Permission format: domain:action:instance
 * Examples:
 *   - api:entries:read
 *   - api:treatments:create
 *   - *:*:read (wildcard - read any domain/action)
 *   - * (full admin access)
 */

/**
 * Permission trie node for efficient permission matching
 */
interface TrieNode {
  [key: string]: TrieNode | boolean | undefined;
  $end?: boolean;
}

/**
 * Create a new permission trie
 */
export function createShiroTrie() {
  const root: TrieNode = {};

  /**
   * Add permissions to the trie
   */
  function add(permissions: string | string[]) {
    const perms = Array.isArray(permissions) ? permissions : [permissions];
    
    for (const perm of perms) {
      const parts = perm.split(':');
      let node = root;
      
      for (const part of parts) {
        if (!node[part]) {
          node[part] = {};
        }
        node = node[part] as TrieNode;
      }
      
      node.$end = true;
    }
  }

  /**
   * Check if a permission is granted
   * Supports wildcards at any level
   */
  function check(permission: string): boolean {
    const parts = permission.split(':');
    return checkNode(root, parts, 0);
  }

  function checkNode(node: TrieNode, parts: string[], index: number): boolean {
    // If we've reached the end of the permission string
    if (index >= parts.length) {
      return node.$end === true || '*' in node || hasAnyEndNode(node);
    }

    const part = parts[index];

    // Check for exact match
    if (node[part]) {
      if (checkNode(node[part] as TrieNode, parts, index + 1)) {
        return true;
      }
    }

    // Check for wildcard at this level
    if (node['*']) {
      if (checkNode(node['*'] as TrieNode, parts, index + 1)) {
        return true;
      }
      // Wildcard can match remaining parts
      if ((node['*'] as TrieNode).$end) {
        return true;
      }
    }

    return false;
  }

  function hasAnyEndNode(node: TrieNode): boolean {
    for (const key of Object.keys(node)) {
      if (key === '$end' && node.$end) {
        return true;
      }
      if (key !== '$end' && typeof node[key] === 'object') {
        if (hasAnyEndNode(node[key] as TrieNode)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get all permissions from the trie
   */
  function getPermissions(): string[] {
    const permissions: string[] = [];
    collectPermissions(root, [], permissions);
    return permissions;
  }

  function collectPermissions(node: TrieNode, path: string[], result: string[]) {
    if (node.$end) {
      result.push(path.join(':'));
    }
    
    for (const key of Object.keys(node)) {
      if (key !== '$end') {
        collectPermissions(node[key] as TrieNode, [...path, key], result);
      }
    }
  }

  return {
    add,
    check,
    getPermissions
  };
}

/**
 * Default role definitions matching legacy Nightscout roles
 */
export const defaultRoles: Record<string, string[]> = {
  'admin': ['*'],
  'denied': [],
  'status-only': ['api:status:read'],
  'readable': ['*:*:read'],
  'careportal': ['api:treatments:create'],
  'devicestatus-upload': ['api:devicestatus:create'],
  'activity': ['api:activity:create']
};

/**
 * Create a shiro trie from role names
 */
export function createTrieFromRoles(roleNames: string[]): ReturnType<typeof createShiroTrie> {
  const trie = createShiroTrie();
  
  for (const roleName of roleNames) {
    const role = defaultRoles[roleName];
    if (role) {
      trie.add(role);
    }
  }
  
  return trie;
}

/**
 * Check if a permission is granted by any of the given shiro tries
 */
export function isPermitted(tries: ReturnType<typeof createShiroTrie>[], permission: string): boolean {
  for (const trie of tries) {
    if (trie.check(permission)) {
      return true;
    }
  }
  return false;
}

/**
 * Common permission constants
 */
export const Permissions = {
  // Status
  STATUS_READ: 'api:status:read',
  
  // Entries
  ENTRIES_READ: 'api:entries:read',
  ENTRIES_CREATE: 'api:entries:create',
  ENTRIES_UPDATE: 'api:entries:update',
  ENTRIES_DELETE: 'api:entries:delete',
  
  // Treatments
  TREATMENTS_READ: 'api:treatments:read',
  TREATMENTS_CREATE: 'api:treatments:create',
  TREATMENTS_UPDATE: 'api:treatments:update',
  TREATMENTS_DELETE: 'api:treatments:delete',
  
  // Devicestatus
  DEVICESTATUS_READ: 'api:devicestatus:read',
  DEVICESTATUS_CREATE: 'api:devicestatus:create',
  DEVICESTATUS_UPDATE: 'api:devicestatus:update',
  DEVICESTATUS_DELETE: 'api:devicestatus:delete',
  
  // Profile
  PROFILE_READ: 'api:profile:read',
  PROFILE_CREATE: 'api:profile:create',
  PROFILE_UPDATE: 'api:profile:update',
  PROFILE_DELETE: 'api:profile:delete',
  
  // Food
  FOOD_READ: 'api:food:read',
  FOOD_CREATE: 'api:food:create',
  FOOD_UPDATE: 'api:food:update',
  FOOD_DELETE: 'api:food:delete',
  
  // Settings
  SETTINGS_READ: 'api:settings:read',
  SETTINGS_CREATE: 'api:settings:create',
  SETTINGS_UPDATE: 'api:settings:update',
  SETTINGS_DELETE: 'api:settings:delete',
  
  // Activity
  ACTIVITY_CREATE: 'api:activity:create',
  
  // Admin
  ADMIN: '*'
} as const;

export type PermissionKey = keyof typeof Permissions;
export type Permission = typeof Permissions[PermissionKey];

