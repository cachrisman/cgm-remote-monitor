import { NextResponse } from "next/server";
import { createNightscoutClient } from "@/lib/nightscout-client";

export const dynamic = "force-dynamic";

export async function GET() {
  const client = createNightscoutClient();

  try {
    const [entries, status] = await Promise.all([
      client.getRecentEntries(1),
      client.getStatus()
    ]);

    return NextResponse.json({
      status,
      latestEntry: entries.at(0) ?? null
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to fetch Nightscout status"
      },
      { status: 502 }
    );
  }
}
