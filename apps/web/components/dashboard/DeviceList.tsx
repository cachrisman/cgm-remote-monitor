import type { DeviceStatus } from "@/lib/nightscout-client";

type DeviceListProps = {
  devices: DeviceStatus[];
};

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function DeviceList({ devices }: DeviceListProps) {
  if (devices.length === 0) {
    return (
      <article className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-5 text-sm text-slate-400">
        Configure device integrations in the admin console to populate this list with pumps, transmitters, and services.
      </article>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {devices.map((device, index) => (
        <article
          key={`${device.name}-${index}`}
          className="flex flex-col gap-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
        >
          <h3 className="text-base font-semibold text-white">{device.name}</h3>
          <p className="text-sm text-slate-300">{device.status}</p>
          {device.lastUpdated ? (
            <p className="text-xs text-slate-500">Last updated {formatTimestamp(device.lastUpdated)}</p>
          ) : null}
        </article>
      ))}
    </div>
  );
}
