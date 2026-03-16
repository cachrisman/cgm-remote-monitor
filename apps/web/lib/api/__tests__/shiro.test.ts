import {
  createShiroTrie,
  defaultRoles,
  createTrieFromRoles,
  isPermitted,
  Permissions
} from "../shiro";

describe("Shiro Permission System", () => {
  describe("createShiroTrie", () => {
    it("creates an empty trie", () => {
      const trie = createShiroTrie();
      expect(trie.getPermissions()).toEqual([]);
    });

    it("adds single permission", () => {
      const trie = createShiroTrie();
      trie.add("api:entries:read");
      
      expect(trie.check("api:entries:read")).toBe(true);
      expect(trie.check("api:entries:write")).toBe(false);
    });

    it("adds multiple permissions", () => {
      const trie = createShiroTrie();
      trie.add(["api:entries:read", "api:treatments:create"]);
      
      expect(trie.check("api:entries:read")).toBe(true);
      expect(trie.check("api:treatments:create")).toBe(true);
      expect(trie.check("api:entries:write")).toBe(false);
    });

    it("handles wildcard at any level", () => {
      const trie = createShiroTrie();
      trie.add("*:entries:read");
      
      expect(trie.check("api:entries:read")).toBe(true);
      expect(trie.check("admin:entries:read")).toBe(true);
      expect(trie.check("api:treatments:read")).toBe(false);
    });

    it("handles multi-level wildcard", () => {
      const trie = createShiroTrie();
      trie.add("*:*:read");
      
      expect(trie.check("api:entries:read")).toBe(true);
      expect(trie.check("admin:treatments:read")).toBe(true);
      expect(trie.check("api:entries:write")).toBe(false);
    });

    it("handles full wildcard", () => {
      const trie = createShiroTrie();
      trie.add("*");
      
      expect(trie.check("api:entries:read")).toBe(true);
      expect(trie.check("anything")).toBe(true);
      expect(trie.check("a:b:c:d:e")).toBe(true);
    });
  });

  describe("defaultRoles", () => {
    it("has admin role with full permissions", () => {
      expect(defaultRoles.admin).toEqual(["*"]);
    });

    it("has denied role with no permissions", () => {
      expect(defaultRoles.denied).toEqual([]);
    });

    it("has readable role with read-only permissions", () => {
      expect(defaultRoles.readable).toEqual(["*:*:read"]);
    });

    it("has status-only role", () => {
      expect(defaultRoles["status-only"]).toEqual(["api:status:read"]);
    });

    it("has careportal role", () => {
      expect(defaultRoles.careportal).toEqual(["api:treatments:create"]);
    });
  });

  describe("createTrieFromRoles", () => {
    it("creates trie from admin role", () => {
      const trie = createTrieFromRoles(["admin"]);
      expect(trie.check("api:entries:read")).toBe(true);
      expect(trie.check("anything")).toBe(true);
    });

    it("creates trie from readable role", () => {
      const trie = createTrieFromRoles(["readable"]);
      expect(trie.check("api:entries:read")).toBe(true);
      expect(trie.check("api:entries:create")).toBe(false);
    });

    it("creates trie from multiple roles", () => {
      const trie = createTrieFromRoles(["readable", "careportal"]);
      expect(trie.check("api:entries:read")).toBe(true);
      expect(trie.check("api:treatments:create")).toBe(true);
      expect(trie.check("api:entries:delete")).toBe(false);
    });

    it("ignores unknown roles", () => {
      const trie = createTrieFromRoles(["unknown-role"]);
      expect(trie.check("api:entries:read")).toBe(false);
    });
  });

  describe("isPermitted", () => {
    it("checks permission across multiple tries", () => {
      const trie1 = createShiroTrie();
      trie1.add("api:entries:read");
      
      const trie2 = createShiroTrie();
      trie2.add("api:treatments:read");
      
      expect(isPermitted([trie1, trie2], "api:entries:read")).toBe(true);
      expect(isPermitted([trie1, trie2], "api:treatments:read")).toBe(true);
      expect(isPermitted([trie1, trie2], "api:devicestatus:read")).toBe(false);
    });

    it("returns false for empty tries array", () => {
      expect(isPermitted([], "api:entries:read")).toBe(false);
    });
  });

  describe("Permissions constants", () => {
    it("has correct permission strings", () => {
      expect(Permissions.STATUS_READ).toBe("api:status:read");
      expect(Permissions.ENTRIES_READ).toBe("api:entries:read");
      expect(Permissions.ENTRIES_CREATE).toBe("api:entries:create");
      expect(Permissions.TREATMENTS_READ).toBe("api:treatments:read");
      expect(Permissions.DEVICESTATUS_READ).toBe("api:devicestatus:read");
      expect(Permissions.ADMIN).toBe("*");
    });
  });
});

