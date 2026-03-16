import type { createNightscoutClient } from "./nightscout-client";

export type GlucoseEntry = Awaited<
  ReturnType<ReturnType<typeof createNightscoutClient>["getRecentEntries"]>
>[number];

export function dedupeEntries(entries: GlucoseEntry[]) {
  const seen = new Map<string, GlucoseEntry>();

  for (const e of entries) {
    const key = `${new Date(e.measuredAt).getTime()}-${Math.round(e.mgdl)}`;
    if (!seen.has(key)) {
      seen.set(key, e);
    }
  }

  return Array.from(seen.values()).sort(
    (a, b) => new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime()
  );
}
