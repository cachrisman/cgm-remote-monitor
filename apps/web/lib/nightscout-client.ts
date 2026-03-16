import { getApiBaseUrl } from "./env";

export type GlucoseValue = {
  mgdl: number;
  direction: string | null;
  measuredAt: string;
};

export type DeviceStatus = {
  name: string;
  status: string;
  lastUpdated: string | null;
};

export type StatusSummary = {
  state: string;
  devices: DeviceStatus[];
};

type NightscoutClientConfig = {
  baseUrl?: string;
  /**
   * Optional headers to pass through from the incoming request.
   * Used for passing client auth tokens through server components.
   * If not provided, requests will fail with 401 and the client component will handle auth.
   */
  headers?: HeadersInit;
};

const DEFAULT_REVALIDATE_SECONDS = 30;
const DEFAULT_API_BASE = "/api/v1";

/**
 * Create headers for API requests from the provided config.
 * If no headers are provided, returns empty headers (request will fail with 401,
 * which is handled gracefully by the page component).
 */
function createRequestHeaders(config: NightscoutClientConfig): HeadersInit {
  if (!config.headers) {
    return {};
  }
  
  const headers: HeadersInit = {};
  
  // Merge provided headers
  if (config.headers instanceof Headers) {
    config.headers.forEach((value, key) => {
      headers[key] = value;
    });
  } else if (Array.isArray(config.headers)) {
    // Array of [key, value] pairs
    for (const [key, value] of config.headers) {
      headers[key] = value;
    }
  } else {
    // Record/object
    Object.assign(headers, config.headers);
  }

  return headers;
}

async function parseJson<T>(response: Response) {
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Nightscout API request failed (${response.status}): ${error}`);
  }

  return (await response.json()) as T;
}

function sanitizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/$/, "");
}

function getDefaultOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }

  if (process.env.NEXT_PRIVATE_INTERNAL_ORIGIN) {
    return process.env.NEXT_PRIVATE_INTERNAL_ORIGIN.replace(/\/$/, "");
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }

  return "http://localhost:3000";
}

function buildUrl(
  baseUrl: string,
  path: string,
  searchParams?: Record<string, string>
) {
  const cleanedBase = sanitizeBaseUrl(baseUrl || DEFAULT_API_BASE);
  const query =
    searchParams && Object.keys(searchParams).length > 0
      ? `?${new URLSearchParams(searchParams).toString()}`
      : "";

  const isAbsolute = /^https?:\/\//i.test(cleanedBase);
  const origin = isAbsolute ? "" : getDefaultOrigin();

  const prefix = isAbsolute ? cleanedBase : `${origin}${cleanedBase}`;
  return `${prefix}${path}${query}`;
}

type EntriesQueryOptions = {
  limit?: number;
  hours?: number;
};

async function fetchRecentEntries(config: NightscoutClientConfig, options: EntriesQueryOptions = {}) {
  const baseUrl = config.baseUrl ?? getApiBaseUrl();
  
  const params: Record<string, string> = {};
  
  // If hours specified, use date filter for exact time range
  if (options.hours) {
    const cutoff = Date.now() - (options.hours * 60 * 60 * 1000);
    params["find[date][$gte]"] = String(cutoff);
    // Set a high count to get all entries in the range
    params["count"] = "10000";
  } else if (options.limit) {
    params["count"] = String(options.limit);
  }
  
  const url = buildUrl(baseUrl, "/entries", params);

  const response = await fetch(url, {
    headers: createRequestHeaders(config),
    next: { revalidate: DEFAULT_REVALIDATE_SECONDS }
  });

  const payload = await parseJson<Array<Record<string, unknown>>>(response);

  return payload
    .map((item) => {
      const mgdl = typeof item.sgv === "number" ? item.sgv : null;
      const direction = typeof item.direction === "string" ? item.direction : null;
      const measuredAt = typeof item.dateString === "string" ? item.dateString : null;

      if (mgdl === null || measuredAt === null) {
        return null;
      }

      return {
        mgdl,
        direction,
        measuredAt
      } satisfies GlucoseValue;
    })
    .filter(Boolean) as GlucoseValue[];
}

async function fetchStatus(config: NightscoutClientConfig) {
  const baseUrl = config.baseUrl ?? getApiBaseUrl();
  const url = buildUrl(baseUrl, "/status");

  const response = await fetch(url, {
    headers: createRequestHeaders(config),
    next: { revalidate: DEFAULT_REVALIDATE_SECONDS }
  });

  const payload = await parseJson<Record<string, unknown>>(response);
  const status = payload.status as Record<string, unknown> | undefined;
  const devices = (payload.devices as Array<Record<string, unknown>>) ?? [];

  const state = typeof status?.state === "string" ? status.state : "unknown";

  return {
    state,
    devices: devices
      .map((device) => {
        const name = typeof device.name === "string" ? device.name : "Unknown";
        const statusText = typeof device.status === "string" ? device.status : "Unavailable";
        const lastUpdated =
          typeof device.lastUpdated === "string" ? device.lastUpdated : null;

        return {
          name,
          status: statusText,
          lastUpdated
        } satisfies DeviceStatus;
      })
  } satisfies StatusSummary;
}

export function createNightscoutClient(config: NightscoutClientConfig = {}) {
  return {
    getRecentEntries(limit = 24) {
      return fetchRecentEntries(config, { limit });
    },
    getEntriesByHours(hours: number) {
      return fetchRecentEntries(config, { hours });
    },
    getStatus() {
      return fetchStatus(config);
    }
  };
}
