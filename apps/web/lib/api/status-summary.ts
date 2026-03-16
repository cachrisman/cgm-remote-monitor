import { findDeviceStatuses } from "./devicestatus";
import { findEntries } from "./entries";

const OK_THRESHOLD_MS = 1000 * 60 * 10; // 10 minutes
const WARN_THRESHOLD_MS = 1000 * 60 * 30; // 30 minutes

export type StatusSummary = {
  state: string;
  devices: Array<{
    name: string;
    status: string;
    lastUpdated: string | null;
  }>;
};

function getEntryTimestamp(entry: Record<string, unknown> | undefined) {
  if (!entry) return null;
  const explicitDate =
    typeof entry.date === "number" ? entry.date : Number(entry.date);
  if (Number.isFinite(explicitDate)) return Number(explicitDate);

  const isoDate =
    typeof entry.dateString === "string"
      ? entry.dateString
      : typeof entry.sysTime === "string"
        ? entry.sysTime
        : null;

  if (!isoDate) return null;
  const parsed = Date.parse(isoDate);
  return Number.isNaN(parsed) ? null : parsed;
}

function summarizeDevice(raw: Record<string, unknown>) {
  const uploader = (raw.uploader ?? {}) as Record<string, unknown>;
  const pump = (raw.pump ?? {}) as Record<string, unknown>;
  const status = (raw.status ?? {}) as Record<string, unknown>;

  const battery =
    typeof uploader.battery === "number"
      ? `${uploader.battery}%`
      : typeof pump?.battery === "object" &&
          pump.battery &&
          typeof (pump.battery as Record<string, unknown>).percent === "number"
        ? `${(pump.battery as Record<string, number>).percent}%`
        : null;

  const name =
    (typeof raw.device === "string" && raw.device) ||
    (typeof uploader.device === "string" && uploader.device) ||
    (typeof status.device === "string" && status.device) ||
    "Device";

  const lastUpdated =
    typeof raw.created_at === "string"
      ? raw.created_at
      : typeof raw.mills === "number"
        ? new Date(raw.mills).toISOString()
        : null;

  const statusText =
    typeof status.status === "string"
      ? status.status
      : battery
        ? `Battery ${battery}`
        : "Reported";

  return {
    name,
    status: statusText,
    lastUpdated
  };
}

export async function buildStatusSummary(): Promise<{
  status: StatusSummary;
  latestEntry: Record<string, unknown> | null;
}> {
  const startTime = Date.now();
  const [entries, devices] = await Promise.all([
    findEntries(new URLSearchParams({ count: "1" })),
    findDeviceStatuses(new URLSearchParams({ count: "5" }))
  ]);
  
  if (process.env.NODE_ENV === 'development') {
    const queryTime = Date.now() - startTime;
    if (queryTime > 1000) {
      console.warn(`[status-summary] Slow queries: ${queryTime}ms`);
    }
  }

  const latestEntry = entries.at(0);
  const entryTimestamp = getEntryTimestamp(latestEntry);

  const now = Date.now();
  let state = "unknown";

  if (entryTimestamp !== null) {
    const age = now - entryTimestamp;
    if (age <= OK_THRESHOLD_MS) {
      state = "ok";
    } else if (age <= WARN_THRESHOLD_MS) {
      state = "warn";
    } else {
      state = "stale";
    }
  }

  const status: StatusSummary = {
    state,
    devices: devices.map((device) => summarizeDevice(device))
  };

  return { status, latestEntry: latestEntry ?? null };
}
