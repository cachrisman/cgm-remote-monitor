/**
 * Settings reader that matches legacy lib/settings.js behavior.
 * Reads environment variables to construct the Nightscout settings object.
 */

// Constants (from lib/constants.json)
export const MMOL_TO_MGDL = 18.018018018;

export interface Thresholds {
  bgHigh: number;
  bgTargetTop: number;
  bgTargetBottom: number;
  bgLow: number;
}

export interface NightscoutSettings {
  units: string;
  timeFormat: number;
  dayStart: number;
  dayEnd: number;
  nightMode: boolean;
  editMode: boolean;
  showRawbg: string;
  customTitle: string;
  theme: string;
  alarmUrgentHigh: boolean;
  alarmUrgentHighMins: number[];
  alarmHigh: boolean;
  alarmHighMins: number[];
  alarmLow: boolean;
  alarmLowMins: number[];
  alarmUrgentLow: boolean;
  alarmUrgentLowMins: number[];
  alarmUrgentMins: number[];
  alarmWarnMins: number[];
  alarmTimeagoWarn: boolean;
  alarmTimeagoWarnMins: number;
  alarmTimeagoUrgent: boolean;
  alarmTimeagoUrgentMins: number;
  alarmPumpBatteryLow: boolean;
  language: string;
  scaleY: string;
  showPlugins: string;
  showForecast: string;
  focusHours: number;
  heartbeat: number;
  baseURL: string;
  authDefaultRoles: string;
  thresholds: Thresholds;
  insecureUseHttp: boolean;
  secureHstsHeader: boolean;
  secureHstsHeaderIncludeSubdomains: boolean;
  secureHstsHeaderPreload: boolean;
  secureCsp: boolean;
  deNormalizeDates: boolean;
  showClockDelta: boolean;
  showClockLastTime: boolean;
  authFailDelay: number;
  adminNotifiesEnabled: boolean;
  DEFAULT_FEATURES: string[];
  enable: string[];
  alarmTypes: string[];
  [key: string]: unknown;
}

export interface ExtendedSettings {
  [plugin: string]: Record<string, unknown>;
}

// Secure settings that should be filtered out
const secureSettings = [
  'apnsKey',
  'apnsKeyId',
  'developerTeamId',
  'userName',
  'password',
  'obscured',
  'obscureDeviceProvenance'
];

// Default features
const DEFAULT_FEATURES = [
  'bgnow', 'delta', 'direction', 'timeago', 'devicestatus',
  'upbat', 'errorcodes', 'profile', 'bolus', 'dbsize',
  'runtimestate', 'basal', 'careportal'
];

// Helper functions
function mapTruthy(value: string | boolean | undefined): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'on' || lower === 'true') return true;
    if (lower === 'off' || lower === 'false') return false;
  }
  return false;
}

function mapNumber(value: string | number | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  if (typeof value === 'number') return value;
  const parsed = parseFloat(value.replace(',', '.'));
  return isNaN(parsed) ? defaultValue : parsed;
}

function mapNumberArray(value: string | number[] | undefined, defaultValue: number[]): number[] {
  if (!value) return defaultValue;
  if (Array.isArray(value)) return value;
  if (!isNaN(Number(value))) return [Number(value)];
  return value.split(' ').map(n => Number(n)).filter(n => !isNaN(n));
}

function readEnv(key: string): string | undefined {
  return process.env[key];
}

function readEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return mapTruthy(value);
}

function readEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  return mapNumber(value, defaultValue);
}

function readEnvNumberArray(key: string, defaultValue: number[]): number[] {
  const value = process.env[key];
  return mapNumberArray(value, defaultValue);
}

function getEnableList(): string[] {
  const raw = readEnv('ENABLE') || '';
  const cleaned = decodeURIComponent(raw).toLowerCase();
  return cleaned.split(' ').filter(e => e !== '');
}

function getDisableList(): string[] {
  const raw = readEnv('DISABLE') || '';
  const cleaned = decodeURIComponent(raw).toLowerCase();
  return cleaned.split(' ').filter(e => e !== '');
}

function prepareAlarmTypes(): string[] {
  const raw = readEnv('ALARM_TYPES') || '';
  const types = raw.toLowerCase().split(' ').filter(
    type => type === 'predict' || type === 'simple'
  );
  
  if (types.length === 0) {
    // Check if thresholds were explicitly set
    const thresholdSet = ['BG_HIGH', 'BG_LOW', 'BG_TARGET_TOP', 'BG_TARGET_BOTTOM']
      .some(key => process.env[key] !== undefined);
    return thresholdSet ? ['simple'] : ['predict'];
  }
  
  return types;
}

/**
 * Filter out secure settings from an object
 */
function filterSecure<T extends Record<string, unknown>>(obj: T): T {
  const filtered = { ...obj };
  for (const key of secureSettings) {
    delete filtered[key];
  }
  return filtered;
}

/**
 * Get the base Nightscout settings from environment variables
 */
export function getSettings(): NightscoutSettings {
  const units = readEnv('DISPLAY_UNITS') || readEnv('UNITS') || 'mg/dl';
  
  // Build thresholds
  let thresholds: Thresholds = {
    bgHigh: readEnvNumber('BG_HIGH', 260),
    bgTargetTop: readEnvNumber('BG_TARGET_TOP', 180),
    bgTargetBottom: readEnvNumber('BG_TARGET_BOTTOM', 80),
    bgLow: readEnvNumber('BG_LOW', 55)
  };

  // Convert if needed for mmol/L
  if (units.toLowerCase().includes('mmol') && thresholds.bgHigh < 50) {
    thresholds = {
      bgHigh: Math.round(thresholds.bgHigh * MMOL_TO_MGDL),
      bgTargetTop: Math.round(thresholds.bgTargetTop * MMOL_TO_MGDL),
      bgTargetBottom: Math.round(thresholds.bgTargetBottom * MMOL_TO_MGDL),
      bgLow: Math.round(thresholds.bgLow * MMOL_TO_MGDL)
    };
  }

  // Verify thresholds
  if (thresholds.bgTargetBottom >= thresholds.bgTargetTop) {
    thresholds.bgTargetBottom = thresholds.bgTargetTop - 1;
  }
  if (thresholds.bgLow >= thresholds.bgTargetBottom) {
    thresholds.bgLow = thresholds.bgTargetBottom - 1;
  }
  if (thresholds.bgHigh <= thresholds.bgTargetTop) {
    thresholds.bgHigh = thresholds.bgTargetTop + 1;
  }

  // Build enable list
  const enableList = getEnableList();
  const disableList = getDisableList();
  const alarmTypes = prepareAlarmTypes();

  // Add default features
  const enable = [...enableList];
  for (const feature of DEFAULT_FEATURES) {
    if (!enable.includes(feature)) {
      enable.push(feature);
    }
  }

  // Add alarm type features
  if (alarmTypes.includes('simple')) {
    enable.push('simplealarms');
  }
  if (alarmTypes.includes('predict')) {
    enable.push('ar2');
  }

  // Remove disabled features
  const finalEnable = enable.filter(f => !disableList.includes(f));

  // Build showPlugins
  let showPlugins = readEnv('SHOW_PLUGINS') || 'dbsize';
  showPlugins += ' delta direction upbat';
  const showRawbg = readEnv('SHOW_RAWBG') || 'never';
  if (showRawbg === 'always' || showRawbg === 'noise') {
    showPlugins += ' rawbg';
  }

  const settings: NightscoutSettings = {
    units,
    timeFormat: readEnvNumber('TIME_FORMAT', 12),
    dayStart: readEnvNumber('DAY_START', 7.0),
    dayEnd: readEnvNumber('DAY_END', 21.0),
    nightMode: readEnvBool('NIGHT_MODE', false),
    editMode: readEnvBool('EDIT_MODE', true),
    showRawbg,
    customTitle: readEnv('CUSTOM_TITLE') || 'Nightscout',
    theme: readEnv('THEME') || 'default',
    alarmUrgentHigh: readEnvBool('ALARM_URGENT_HIGH', true),
    alarmUrgentHighMins: readEnvNumberArray('ALARM_URGENT_HIGH_MINS', [30, 60, 90, 120]),
    alarmHigh: readEnvBool('ALARM_HIGH', true),
    alarmHighMins: readEnvNumberArray('ALARM_HIGH_MINS', [30, 60, 90, 120]),
    alarmLow: readEnvBool('ALARM_LOW', true),
    alarmLowMins: readEnvNumberArray('ALARM_LOW_MINS', [15, 30, 45, 60]),
    alarmUrgentLow: readEnvBool('ALARM_URGENT_LOW', true),
    alarmUrgentLowMins: readEnvNumberArray('ALARM_URGENT_LOW_MINS', [15, 30, 45]),
    alarmUrgentMins: readEnvNumberArray('ALARM_URGENT_MINS', [30, 60, 90, 120]),
    alarmWarnMins: readEnvNumberArray('ALARM_WARN_MINS', [30, 60, 90, 120]),
    alarmTimeagoWarn: readEnvBool('ALARM_TIMEAGO_WARN', true),
    alarmTimeagoWarnMins: readEnvNumber('ALARM_TIMEAGO_WARN_MINS', 15),
    alarmTimeagoUrgent: readEnvBool('ALARM_TIMEAGO_URGENT', true),
    alarmTimeagoUrgentMins: readEnvNumber('ALARM_TIMEAGO_URGENT_MINS', 30),
    alarmPumpBatteryLow: readEnvBool('ALARM_PUMP_BATTERY_LOW', false),
    language: readEnv('LANGUAGE') || 'en',
    scaleY: readEnv('SCALE_Y') || 'log',
    showPlugins,
    showForecast: readEnv('SHOW_FORECAST') || 'ar2',
    focusHours: readEnvNumber('FOCUS_HOURS', 3),
    heartbeat: readEnvNumber('HEARTBEAT', 60),
    baseURL: readEnv('BASE_URL') || '',
    authDefaultRoles: readEnv('AUTH_DEFAULT_ROLES') || 'readable',
    thresholds,
    insecureUseHttp: readEnvBool('INSECURE_USE_HTTP', false),
    secureHstsHeader: readEnvBool('SECURE_HSTS_HEADER', true),
    secureHstsHeaderIncludeSubdomains: readEnvBool('SECURE_HSTS_HEADER_INCLUDESUBDOMAINS', false),
    secureHstsHeaderPreload: readEnvBool('SECURE_HSTS_HEADER_PRELOAD', false),
    secureCsp: readEnvBool('SECURE_CSP', false),
    deNormalizeDates: readEnvBool('DE_NORMALIZE_DATES', false),
    showClockDelta: readEnvBool('SHOW_CLOCK_DELTA', false),
    showClockLastTime: readEnvBool('SHOW_CLOCK_LAST_TIME', false),
    authFailDelay: readEnvNumber('AUTH_FAIL_DELAY', 5000),
    adminNotifiesEnabled: readEnvBool('ADMIN_NOTIFIES_ENABLED', true),
    DEFAULT_FEATURES,
    enable: finalEnable,
    alarmTypes
  };

  return settings;
}

/**
 * Get filtered settings (without secure values)
 */
export function getFilteredSettings(): NightscoutSettings {
  return filterSecure(getSettings());
}

/**
 * Get extended settings for plugins
 * Reads environment variables with pattern PLUGIN_NAME_SETTING
 */
export function getExtendedSettings(): ExtendedSettings {
  const extended: ExtendedSettings = {};
  const settings = getSettings();

  // Look for plugin-specific environment variables
  for (const plugin of settings.enable) {
    const prefix = plugin.toUpperCase() + '_';
    const pluginSettings: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(prefix)) {
        const settingName = key.slice(prefix.length).toLowerCase();
        pluginSettings[settingName] = value;
      }
    }

    if (Object.keys(pluginSettings).length > 0) {
      extended[plugin] = pluginSettings;
    }
  }

  return filterSecure(extended) as ExtendedSettings;
}

/**
 * Check if a feature/plugin is enabled
 */
export function isEnabled(feature: string | string[]): boolean {
  const settings = getSettings();
  
  if (Array.isArray(feature)) {
    return feature.some(f => settings.enable.includes(f));
  }
  
  return settings.enable.includes(feature);
}

/**
 * Get app information
 */
export function getAppInfo(): { name: string; version: string } {
  return {
    name: 'Nightscout',
    version: process.env.NIGHTSCOUT_VERSION || '15.0.3'
  };
}

