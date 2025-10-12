import { createNightscoutClient } from "@/lib/nightscout-client";
import { TrendSparkline } from "@/components/dashboard/TrendSparkline";
import { StatusCard } from "@/components/dashboard/StatusCard";

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
      client.getRecentEntries(24),
      client.getStatus()
    ]);
  } catch (error) {
    fetchError =
      error instanceof Error
        ? error.message
        : "Unable to reach the Nightscout API";
  }

  const mostRecentEntry = entries.at(0);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-[0.3em] text-brand-light">Nightscout</p>
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Real-time glucose insights
        </h1>
        <p className="max-w-2xl text-base text-slate-300">
          This Next.js dashboard streams your latest glucose readings, device health, and status at a glance. The data below is
          fetched directly from the Nightscout API using server components.
        </p>
        {fetchError ? (
          <p className="text-sm font-medium text-amber-300">
            {fetchError}. Showing the most recently cached values instead.
          </p>
        ) : null}
      </header>

      <section className="grid gap-6 md:grid-cols-3">
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
          tone={mostRecentEntry && mostRecentEntry.mgdl >= 70 && mostRecentEntry.mgdl <= 180 ? "success" : "warning"}
        />

        <StatusCard
          title="System state"
          value={status.state}
          description={
            status.devices.length > 0
              ? `${status.devices.length} connected device${status.devices.length === 1 ? "" : "s"}`
              : "No device telemetry reported"
          }
          tone={status.state === "ok" ? "success" : status.state === "warn" ? "warning" : "default"}
        />

        <StatusCard
          title="Last trend"
          value={mostRecentEntry?.direction ?? "Unknown"}
          description="Arrow direction reflects the newest CGM entry"
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

      <section className="grid gap-4 md:grid-cols-2">
        {status.devices.map((device) => (
          <article
            key={device.name}
            className="flex flex-col gap-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
          >
            <h3 className="text-base font-semibold text-white">{device.name}</h3>
            <p className="text-sm text-slate-300">{device.status}</p>
            {device.lastUpdated ? (
              <p className="text-xs text-slate-500">Last updated {formatTimestamp(device.lastUpdated)}</p>
            ) : null}
          </article>
        ))}
        {status.devices.length === 0 ? (
          <article className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-5 text-sm text-slate-400">
            Configure device integrations in the admin console to populate this list with pumps, transmitters, and services.
          </article>
        ) : null}
      </section>
    </main>
  );
}
