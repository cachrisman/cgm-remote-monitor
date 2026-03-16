import {
  getSettings,
  getFilteredSettings,
  isEnabled,
  getAppInfo,
  MMOL_TO_MGDL
} from "../settings";

describe("Settings Module", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment for each test - create a clean copy
    process.env = { 
      ...originalEnv,
      // Clear settings-related env vars to ensure clean state
      DISPLAY_UNITS: undefined,
      UNITS: undefined,
      THEME: undefined,
      LANGUAGE: undefined,
      BG_HIGH: undefined,
      BG_LOW: undefined,
      BG_TARGET_TOP: undefined,
      BG_TARGET_BOTTOM: undefined,
      ALARM_TYPES: undefined,
      ENABLE: undefined,
      DISABLE: undefined,
    } as NodeJS.ProcessEnv;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("getSettings", () => {
    it("returns default settings when no env vars are set", () => {
      // Explicitly clear all relevant env vars for this test
      delete process.env.THEME;
      delete process.env.DISPLAY_UNITS;
      delete process.env.UNITS;
      
      const settings = getSettings();
      
      expect(settings.units).toBe("mg/dl");
      expect(settings.timeFormat).toBe(12);
      expect(settings.customTitle).toBe("Nightscout");
      expect(settings.theme).toBe("default");
      expect(settings.language).toBe("en");
    });

    it("reads units from DISPLAY_UNITS", () => {
      process.env.DISPLAY_UNITS = "mmol/L";
      const settings = getSettings();
      
      expect(settings.units).toBe("mmol/L");
    });

    it("returns correct thresholds", () => {
      // Clear all threshold-related env vars
      delete process.env.BG_HIGH;
      delete process.env.BG_LOW;
      delete process.env.BG_TARGET_TOP;
      delete process.env.BG_TARGET_BOTTOM;
      
      const settings = getSettings();
      
      expect(settings.thresholds.bgHigh).toBe(260);
      expect(settings.thresholds.bgTargetTop).toBe(180);
      expect(settings.thresholds.bgTargetBottom).toBe(80);
      expect(settings.thresholds.bgLow).toBe(55);
    });

    it("converts thresholds for mmol/L when values are small", () => {
      process.env.DISPLAY_UNITS = "mmol/L";
      process.env.BG_HIGH = "14";
      process.env.BG_TARGET_TOP = "10";
      process.env.BG_TARGET_BOTTOM = "4.5";
      process.env.BG_LOW = "3";
      
      const settings = getSettings();
      
      // Values should be converted to mg/dl
      expect(settings.thresholds.bgHigh).toBe(Math.round(14 * MMOL_TO_MGDL));
      expect(settings.thresholds.bgTargetTop).toBe(Math.round(10 * MMOL_TO_MGDL));
    });

    it("validates threshold ordering", () => {
      process.env.BG_TARGET_BOTTOM = "200"; // Invalid: higher than target top
      process.env.BG_TARGET_TOP = "180";
      
      const settings = getSettings();
      
      // Should be corrected
      expect(settings.thresholds.bgTargetBottom).toBeLessThan(settings.thresholds.bgTargetTop);
    });

    it("includes default features in enable list", () => {
      const settings = getSettings();
      
      expect(settings.enable).toContain("bgnow");
      expect(settings.enable).toContain("delta");
      expect(settings.enable).toContain("direction");
      expect(settings.enable).toContain("timeago");
    });

    it("reads ENABLE env var", () => {
      process.env.ENABLE = "iob cob";
      const settings = getSettings();
      
      expect(settings.enable).toContain("iob");
      expect(settings.enable).toContain("cob");
    });

    it("removes disabled features", () => {
      process.env.DISABLE = "delta direction";
      const settings = getSettings();
      
      expect(settings.enable).not.toContain("delta");
      expect(settings.enable).not.toContain("direction");
    });

    it("reads alarm settings", () => {
      process.env.ALARM_HIGH = "true";
      process.env.ALARM_LOW = "false";
      
      const settings = getSettings();
      
      expect(settings.alarmHigh).toBe(true);
      expect(settings.alarmLow).toBe(false);
    });

    it("reads alarm minute arrays", () => {
      process.env.ALARM_HIGH_MINS = "15 30 45";
      
      const settings = getSettings();
      
      expect(settings.alarmHighMins).toEqual([15, 30, 45]);
    });

    it("includes alarm types", () => {
      // Clear all alarm and threshold env vars to get defaults
      delete process.env.ALARM_TYPES;
      delete process.env.BG_HIGH;
      delete process.env.BG_LOW;
      delete process.env.BG_TARGET_TOP;
      delete process.env.BG_TARGET_BOTTOM;
      
      const settings = getSettings();
      
      // Default alarm type is "predict" when no thresholds are set
      expect(settings.alarmTypes).toContain("predict");
    });

    it("reads custom alarm types", () => {
      process.env.ALARM_TYPES = "simple predict";
      
      const settings = getSettings();
      
      expect(settings.alarmTypes).toContain("simple");
      expect(settings.alarmTypes).toContain("predict");
    });
  });

  describe("getFilteredSettings", () => {
    it("excludes secure settings", () => {
      const settings = getFilteredSettings();
      
      // These should not be present even if set
      expect(settings).not.toHaveProperty("apnsKey");
      expect(settings).not.toHaveProperty("password");
      expect(settings).not.toHaveProperty("userName");
    });
  });

  describe("isEnabled", () => {
    it("returns true for default features", () => {
      expect(isEnabled("bgnow")).toBe(true);
      expect(isEnabled("delta")).toBe(true);
    });

    it("returns false for disabled features", () => {
      process.env.DISABLE = "delta";
      expect(isEnabled("delta")).toBe(false);
    });

    it("returns true for explicitly enabled features", () => {
      process.env.ENABLE = "iob";
      expect(isEnabled("iob")).toBe(true);
    });

    it("checks array of features", () => {
      expect(isEnabled(["bgnow", "iob"])).toBe(true); // bgnow is default
      expect(isEnabled(["nonexistent", "alsonotexist"])).toBe(false);
    });
  });

  describe("getAppInfo", () => {
    it("returns app name and version", () => {
      const info = getAppInfo();
      
      expect(info.name).toBe("Nightscout");
      expect(info.version).toBeDefined();
    });

    it("uses NIGHTSCOUT_VERSION env var if set", () => {
      process.env.NIGHTSCOUT_VERSION = "custom-version";
      const info = getAppInfo();
      
      expect(info.version).toBe("custom-version");
    });
  });
});

