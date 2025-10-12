import { cache } from "react";
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
};

const DEFAULT_REVALIDATE_SECONDS = 30;

async function parseJson<T>(response: Response) {
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Nightscout API request failed (${response.status}): ${error}`);
  }

  return (await response.json()) as T;
}

const fetchRecentEntries = cache(async (config: NightscoutClientConfig, limit: number) => {
  const baseUrl = config.baseUrl ?? getApiBaseUrl();
  const url = new URL(`${baseUrl}/entries.json`);
  url.searchParams.set("count", String(limit));

  const response = await fetch(url, {
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
});

const fetchStatus = cache(async (config: NightscoutClientConfig) => {
  const baseUrl = config.baseUrl ?? getApiBaseUrl();
  const url = new URL(`${baseUrl}/status.json`);

  const response = await fetch(url, {
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
});

export function createNightscoutClient(config: NightscoutClientConfig = {}) {
  return {
    getRecentEntries(limit = 24) {
      return fetchRecentEntries(config, limit);
    },
    getStatus() {
      return fetchStatus(config);
    }
  };
}
