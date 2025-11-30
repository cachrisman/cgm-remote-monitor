import Link from "next/link";
import { DeviceList } from "@/components/dashboard/DeviceList";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { StatusCard } from "@/components/dashboard/StatusCard";
import { TrendSparkline } from "@/components/dashboard/TrendSparkline";
import { calculateGlucoseMetrics } from "@/lib/analytics";
import { createNightscoutClient } from "@/lib/nightscout-client";

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default async function DashboardPage() {
  const client = createNightscoutClient();

  let entries = [] as Awaited<ReturnType<typeof client.getRecentEntries>>;
  let status = {
    state: "unknown",
    devices: []
  } as Awaited<ReturnType<typeof client.getStatus>>;
  let fetchError: string | null = null;

  try {
    [entries, status] = await Promise.all([
      client.getRecentEntries(48),
      client.getStatus()
    ]);
  } catch (error) {
    fetchError =
      error instanceof Error
        ? error.message
        : "Unable to reach the Nightscout API";
  }

  const mostRecentEntry = entries.at(0);
  const metrics = calculateGlucoseMetrics(entries);
  const recentReadings = entries.slice(0, 5);

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-6 py-10">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-brand-dark/40 via-slate-950 to-slate-950" />
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-[0.3em] text-brand-light">Nightscout Next</p>
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Real-time glucose insights
          </h1>
          <p className="max-w-2xl text-base text-slate-300">
            Next.js-powered dashboard with typed API clients, server components, and live telemetry from your Nightscout
            deployment.
          </p>
          {fetchError ? (
            <p className="text-sm font-medium text-amber-300">
              {fetchError}. Showing the most recently cached values instead.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/reports"
            className="rounded-full bg-brand-dark px-4 py-2 text-sm font-semibold text-brand-light shadow-md transition hover:bg-brand-dark/80"
          >
            Reports preview
          </Link>
          <Link
            href="/profile"
            className="rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-light/70 hover:text-brand-light"
          >
            Profile editor
          </Link>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="grid gap-4 sm:grid-cols-2">
            <MetricCard
              title="Time in range"
              value={`${metrics.timeInRange}%`}
              description="Past 48 readings within 70-180 mg/dL"
              tone={metrics.timeInRange >= 70 ? "success" : "warning"}
            />
            <MetricCard
              title="Average"
              value={metrics.averageMgdl ? `${metrics.averageMgdl} mg/dL` : "–"}
              description={metrics.min && metrics.max ? `Low ${metrics.min} • High ${metrics.max}` : "Waiting for data"}
              tone="default"
            />
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">24-hour trend</h2>
                <p className="text-sm text-slate-400">
                  Sparkline visualizing the most recent entries returned from `/entries.json`.
                </p>
              </div>
              {mostRecentEntry ? (
                <span className="rounded-full bg-brand-dark/40 px-4 py-1 text-xs font-medium uppercase tracking-wide text-brand-light">
                  Updated {formatTimestamp(mostRecentEntry.measuredAt)}
                </span>
              ) : null}
            </div>
            <div className="mt-6 overflow-hidden rounded-2xl bg-slate-950/60 p-4">
              <TrendSparkline entries={entries} />
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <StatusCard
            title="Latest glucose"
            value={
              mostRecentEntry
                ? `${Math.round(mostRecentEntry.mgdl)} mg/dL`
                : "No data"
            }
            description={
              mostRecentEntry
                ? `Measured at ${formatTimestamp(mostRecentEntry.measuredAt)}`
                : "Waiting for first reading"
            }
            tone={
              mostRecentEntry &&
              mostRecentEntry.mgdl >= 70 &&
              mostRecentEntry.mgdl <= 180
                ? "success"
                : "warning"
            }
          />

          <StatusCard
            title="System state"
            value={status.state}
            description={
              status.devices.length > 0
                ? `${status.devices.length} connected device${status.devices.length === 1 ? "" : "s"}`
                : "No device telemetry reported"
            }
            tone={
              status.state === "ok"
                ? "success"
                : status.state === "warn"
                  ? "warning"
                  : "default"
            }
          />

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-400">Recent readings</h3>
            <ul className="mt-3 space-y-2">
              {recentReadings.map((reading) => (
                <li
                  key={reading.measuredAt}
                  className="flex items-center justify-between rounded-xl bg-slate-950/60 px-3 py-2 text-sm text-slate-200"
                >
                  <span className="font-medium">{Math.round(reading.mgdl)} mg/dL</span>
                  <span className="text-xs text-slate-500">{formatTimestamp(reading.measuredAt)}</span>
                </li>
              ))}
              {recentReadings.length === 0 ? (
                <li className="rounded-xl bg-slate-950/40 px-3 py-2 text-xs text-slate-500">
                  Waiting for glucose history from Nightscout.
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Devices and integrations</h2>
            <p className="text-sm text-slate-400">
              Live device health pulled from `/status.json`. Configure integrations in the admin console.
            </p>
          </div>
          <Link
            href="/admin"
            className="text-sm font-semibold text-brand-light hover:text-brand-light/80"
          >
            Open admin tools →
          </Link>
        </div>
        <DeviceList devices={status.devices} />
      </section>
    </main>
  );
}
