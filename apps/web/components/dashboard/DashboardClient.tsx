"use client";

import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AuthPrompt } from "@/components/AuthPrompt";
import { getStoredToken, getStoredSessionToken, createAuthHeaders } from "@/lib/auth-token";
import { calculateBasalData, type ProfileDocument, type TempBasalTreatment, type BasalDataPoint } from "@/lib/basal-data";
import { type GlucoseEntry } from "@/lib/dedupe";
import { normalizeGlucoseEntry } from "@/lib/glucose-normalize";

import { BasalDebugPanel } from "./BasalDebugPanel";
import { CurrentReadingPanel } from "./CurrentReadingPanel";
import { LongTermOverviewChart } from "./LongTermOverviewChart";
import { ShortTermChart } from "./ShortTermChart";

import type { StatusSummary } from "@/lib/api/status-summary";
import type { GlucoseThresholds } from "@/lib/glucose-colors";

type DeviceStatus = {
  uploader?: { battery?: number };
  pump?: { reservoir?: number; battery?: { percent?: number } };
  openaps?: { 
    timestamp?: string; 
    status?: string;
    iob?: number;
    cob?: number;
    suggested?: { bg?: number };
    enacted?: { bg?: number };
  };
  iob?: number;
  cob?: number;
  basal?: number;
  created_at?: string;
  [key: string]: unknown;
};

type DashboardClientProps = {
  initialEntries: GlucoseEntry[];
  initialStatus: StatusSummary;
  selectedHours: number;
  requiresAuth?: boolean;
  thresholds: GlucoseThresholds;
};

export function DashboardClient({ initialEntries, initialStatus, selectedHours, requiresAuth = false, thresholds }: DashboardClientProps) {
  const [entries, setEntries] = useState<GlucoseEntry[]>(initialEntries);
  const [status, setStatus] = useState<StatusSummary>(initialStatus);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [profile, setProfile] = useState<ProfileDocument | null>(null);
  const [tempBasalTreatments, setTempBasalTreatments] = useState<TempBasalTreatment[]>([]);
  const [treatments, setTreatments] = useState<Array<{ eventType?: string; insulin?: number; created_at?: string; [key: string]: unknown }>>([]);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
  const [debugInfo, setDebugInfo] = useState<{
    activePointInfo: { point: { time: number; glucose?: number; displayTime: string }; index: number } | null;
    activeTimestamp: number | null;
    data: Array<{ time: number; displayTime: string; glucose?: number; basal?: number; basalIcicle?: number }>;
  } | null>(null);

  const handleDebugInfo = useCallback((info: {
    activePointInfo: { point: { time: number; glucose?: number; displayTime: string }; index: number } | null;
    activeTimestamp: number | null;
    data: Array<{ time: number; displayTime: string; glucose?: number; basal?: number; basalIcicle?: number }>;
  }) => {
    setDebugInfo(info);
  }, []);

  const now = Date.now();
  
  // State for selected time range (shared between short-term and long-term charts)
  const [selectedTimeRange, setSelectedTimeRange] = useState<{
    startTime: number;
    endTime: number;
  }>(() => {
    const initNow = Date.now();
    const initFutureBuffer = 30 * 60 * 1000;
    return {
      startTime: initNow - selectedHours * 60 * 60 * 1000,
      endTime: initNow + initFutureBuffer,
    };
  });

  // Sync selectedTimeRange when selectedHours changes
  useEffect(() => {
    const currentNow = Date.now();
    const currentFutureBuffer = 30 * 60 * 1000;
    setSelectedTimeRange({
      startTime: currentNow - selectedHours * 60 * 60 * 1000,
      endTime: currentNow + currentFutureBuffer,
    });
  }, [selectedHours]);

  const handleSelectionChange = useCallback((startTime: number, endTime: number) => {
    setSelectedTimeRange({ startTime, endTime });
  }, []);
  const router = useRouter();
  const searchParams = useSearchParams();

  const fetchData = useCallback(async () => {
    const headers = createAuthHeaders();
    
    // Use date filter for exactly 48 hours of data
    const cutoff48h = Date.now() - (48 * 60 * 60 * 1000);
    const entriesParams = new URLSearchParams({
      "find[date][$gte]": String(cutoff48h),
      "find[device][$ne]": "nightscout-connect",
      "count": "10000"
    });
    
    // Fetch ALL treatments within selected time period (with buffer for temp basals that may extend)
    // Temp basals can last up to 2 hours, so we need to fetch treatments that started up to
    // (selectedHours + 2) hours ago to catch any that overlap with our time window
    const treatmentsCutoff = Date.now() - ((selectedHours + 3) * 60 * 60 * 1000); // +3 to be safe
    const treatmentsParams = new URLSearchParams({
      "find[created_at][$gte]": new Date(treatmentsCutoff).toISOString(),
      "count": "2000" // Increase limit to ensure we get all temp basals
    });
    
    try {
      const [entriesRes, statusRes, deviceRes, profileRes, treatmentsRes] = await Promise.all([
        fetch(`/api/v1/entries?${entriesParams.toString()}`, { cache: "no-store", headers }),
        fetch("/api/status", { cache: "no-store", headers }),
        fetch("/api/v1/devicestatus?count=5", { cache: "no-store", headers }), // Only need latest 5 for status display
        fetch("/api/v1/profile", { cache: "no-store", headers }), // Get current profile (no count param)
        fetch(`/api/v1/treatments?${treatmentsParams.toString()}`, { cache: "no-store", headers })
      ]);

      // Check for 401 - need authentication
      if (entriesRes.status === 401 || statusRes.status === 401) {
        const token = getStoredToken();
        if (!token) {
          // No token stored, show prompt
          setShowAuthPrompt(true);
          setAuthError("Authentication required to access Nightscout data");
        } else {
          // Token is invalid, show prompt with error
          setShowAuthPrompt(true);
          setAuthError("Your API secret is invalid or expired. Please re-enter it.");
        }
        return;
      }

      if (!entriesRes.ok || !statusRes.ok) return;

      const [entriesJson, statusJson, deviceJson, profileJson, treatmentsJson] = await Promise.all([
        entriesRes.json(),
        statusRes.json(),
        deviceRes.ok ? deviceRes.json() : Promise.resolve([]),
        profileRes.ok ? profileRes.json() : Promise.resolve([]),
        treatmentsRes.ok ? treatmentsRes.json() : Promise.resolve([])
      ]);

      const normalized = (entriesJson as GlucoseEntry[])
        .map((e) => normalizeGlucoseEntry(e))
        .filter((e): e is NonNullable<typeof e> => e !== null && (e as { device?: string }).device !== "nightscout-connect");
      setEntries(normalized);
      setStatus((prev) => statusJson.status ?? prev);
      
      // Store latest devicestatus for status display only (battery, pump status, etc.)
      // Basal calculation now uses profile + treatments only (matching legacy app behavior)
      const deviceStatusArray = Array.isArray(deviceJson) ? deviceJson : [];
      setDeviceStatus(deviceStatusArray.length > 0 ? deviceStatusArray[0] : null);
      
      // Store profile for basal calculation
      const profileArray = Array.isArray(profileJson) ? profileJson : [];
      if (profileArray.length > 0) {
        const profileDoc = profileArray[0] as ProfileDocument;
        setProfile(profileDoc);
        if (process.env.NODE_ENV === 'development') {
          const storeKeys = profileDoc.store ? Object.keys(profileDoc.store) : [];
          const defaultProfile = profileDoc.defaultProfile;
          const activeProfile = defaultProfile && profileDoc.store ? profileDoc.store[defaultProfile] : null;
          console.log('[dashboard] Profile loaded:', {
            hasStore: !!profileDoc.store,
            storeKeys,
            defaultProfile,
            hasDefaultProfileInStore: defaultProfile ? !!profileDoc.store?.[defaultProfile] : false,
            activeProfileBasal: activeProfile?.basal ? activeProfile.basal.length : 0,
            profileStructure: {
              _id: profileDoc._id,
              created_at: profileDoc.created_at,
              startDate: profileDoc.startDate,
              defaultProfile: profileDoc.defaultProfile,
              storeKeys: storeKeys
            }
          });
        }
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[dashboard] No profile loaded from API - profile array is empty');
        }
        setProfile(null);
      }
      
      // Store all treatments
      const treatmentsArray = Array.isArray(treatmentsJson) ? treatmentsJson : [];
      
      // Filter temp basal treatments from all treatments for basal calculation
      // Include all temp basals that overlap with the selected time window
      const now = Date.now();
      const windowStart = now - (selectedHours * 60 * 60 * 1000);
      const windowEnd = now;
      
      const tempBasalOnly = treatmentsArray.filter((t: { eventType?: string }) => t.eventType === 'Temp Basal');
      const processedTempBasals = tempBasalOnly
        .map((t: TempBasalTreatment) => {
          const mills = t.mills ?? (t.created_at ? new Date(t.created_at).getTime() : 
                                   (t.timestamp ? new Date(t.timestamp).getTime() : 0));
          const durationMs = (t.duration ?? 0) * 60 * 1000;
          const endMills = mills + durationMs;
          return {
            ...t,
            mills,
            endmills: endMills
          };
        })
        // Filter to only include temp basals that overlap with our time window
        .filter((t: TempBasalTreatment & { endmills?: number }) => {
          // Include if treatment overlaps with window: starts before window ends AND ends after window starts
          return t.mills && t.endmills && t.mills < windowEnd && t.endmills > windowStart;
        });
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[dashboard] Temp basal treatments:', {
          totalTempBasals: tempBasalOnly.length,
          overlappingWithWindow: processedTempBasals.length,
          windowStart: new Date(windowStart).toISOString(),
          windowEnd: new Date(windowEnd).toISOString(),
          sampleTreatments: processedTempBasals.slice(0, 5).map(t => ({
            time: new Date(t.mills!).toISOString(),
            duration: t.duration,
            absolute: t.absolute,
            percent: t.percent
          }))
        });
      }
      
      setTempBasalTreatments(processedTempBasals);
      
      // Store all treatments for visualization (will be filtered by eventType in components)
      setTreatments(treatmentsArray);
      
      // Clear any auth errors on success
      setAuthError(null);
    } catch {
      // ignore transient network errors
    }
  }, [selectedHours]);

  // On mount, check if authentication is required and if we have stored tokens
  useEffect(() => {
    if (hasCheckedAuth) return;
    setHasCheckedAuth(true);

    // If server-side fetch indicated auth is required, check client-side tokens
    if (requiresAuth) {
      const sessionToken = getStoredSessionToken();
      const rawToken = getStoredToken();
      
      if (!sessionToken && !rawToken) {
        // No tokens stored, show auth prompt
        setShowAuthPrompt(true);
        setAuthError("Authentication required to access Nightscout data");
        return;
      }
      // We have tokens, try to fetch data - fetchData will handle if they're invalid
    }
    
    // Proceed with initial data fetch
    fetchData();
  }, [requiresAuth, hasCheckedAuth, fetchData]);

  // Set up polling for data refresh
  useEffect(() => {
    // Don't start polling if we're showing auth prompt
    if (showAuthPrompt) return;
    
    const id = setInterval(fetchData, 60_000);
    return () => {
      clearInterval(id);
    };
  }, [fetchData, showAuthPrompt]);

  const handleAuthenticated = useCallback(() => {
    setShowAuthPrompt(false);
    setAuthError(null);
    // Re-fetch data with new token
    fetchData();
  }, [fetchData]);

  const handleAuthCancel = useCallback(() => {
    setShowAuthPrompt(false);
  }, []);

  const mostRecentEntry = entries.at(0);

  const shortTermEntries = useMemo(
    () =>
      entries.filter(
        (entry) => {
          const entryTime = new Date(entry.measuredAt).getTime();
          return entryTime >= selectedTimeRange.startTime && entryTime <= selectedTimeRange.endTime;
        }
      ),
    [entries, selectedTimeRange]
  );
  
  // Calculate basal data from profile + temp basal treatments (matching legacy app behavior)
  const basalData: BasalDataPoint[] = useMemo(() => {
    const startTime = selectedTimeRange.startTime;
    const endTime = selectedTimeRange.endTime;
    // allDeviceStatuses is no longer used - basal calculation uses profile + treatments only
    const result = calculateBasalData(profile, tempBasalTreatments, [], startTime, endTime);
    
    // Client-side console log of continuous basal rates for the selected time period
    if (typeof window !== 'undefined') {
      // Build rate segments from basal points (each point represents a rate change)
      const rateSegments: Array<{ start: string; end: string; duration: string; rate: number; scheduledRate: number; isTemp: boolean }> = [];
      
      if (result.length > 0) {
        // Iterate through basal points to create segments
        for (let i = 0; i < result.length; i++) {
          const currentPoint = result[i];
          const nextPoint = result[i + 1];
          
          // Determine the end time for this segment
          const segmentEnd = nextPoint ? nextPoint.time : endTime;
          const durationMs = segmentEnd - currentPoint.time;
          const durationMins = Math.round(durationMs / 60000);
          
          rateSegments.push({
            start: new Date(currentPoint.time).toISOString(),
            end: new Date(segmentEnd).toISOString(),
            duration: `${durationMins} min`,
            rate: currentPoint.rate,
            scheduledRate: currentPoint.scheduledRate,
            isTemp: currentPoint.isTemp
          });
        }
      } else {
        // No basal data - create a single segment showing no basal
        const durationMs = endTime - startTime;
        const durationMins = Math.round(durationMs / 60000);
        rateSegments.push({
          start: new Date(startTime).toISOString(),
          end: new Date(endTime).toISOString(),
          duration: `${durationMins} min`,
          rate: 0,
          scheduledRate: 0,
          isTemp: false
        });
      }
      
      const durationHours = Math.round((endTime - startTime) / (60 * 60 * 1000));
      console.log(`[BASAL TIMELINE] Continuous basal rates for ${durationHours} hour period:`, {
        timeRange: {
          start: new Date(startTime).toISOString(),
          end: new Date(endTime).toISOString(),
          duration: `${durationHours} hours`
        },
        totalMinutes: Math.round((endTime - startTime) / 60000),
        basalPoints: result.length,
        rateSegments: rateSegments
      });
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[dashboard] Basal calculation result:', {
        profileExists: !!profile,
        tempBasalCount: tempBasalTreatments.length,
        basalPointsCount: result.length,
        timeRange: `${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}`
      });
    }
    return result;
  }, [profile, tempBasalTreatments, selectedTimeRange]);

  const longTermEntries = useMemo(
    () =>
      entries.filter(
        (entry) => now - new Date(entry.measuredAt).getTime() <= 48 * 60 * 60 * 1000
      ),
    [entries, now]
  );

  const delta = useMemo(() => {
    if (entries.length < 2) return null;
    const [latest, prev] = entries;
    const diff = latest.mgdl - prev.mgdl;
    const sign = diff > 0 ? "+" : "";
    return `${sign}${Math.round(diff)} mg/dL`;
  }, [entries]);

  const directionLabel = useMemo(() => {
    const dir = mostRecentEntry?.direction?.toLowerCase();
    if (!dir) return null;
    if (dir.includes("up")) return "Rising";
    if (dir.includes("down")) return "Falling";
    if (dir.includes("flat")) return "Flat";
    return mostRecentEntry?.direction ?? null;
  }, [mostRecentEntry]);

  const battery =
    (deviceStatus?.uploader?.battery !== undefined
      ? `${deviceStatus.uploader.battery}%`
      : undefined) ??
    (deviceStatus?.pump?.battery?.percent !== undefined
      ? `${deviceStatus.pump.battery.percent}%`
      : undefined) ??
    null;

  const pumpReservoir =
    deviceStatus?.pump?.reservoir !== undefined ? `${deviceStatus.pump.reservoir}U` : null;

  const openApsStatus = deviceStatus?.openaps?.status ?? null;
  const iob =
    deviceStatus?.iob !== undefined
      ? `${Number(deviceStatus.iob).toFixed(2)}U`
      : deviceStatus?.openaps?.iob
        ? `${Number(deviceStatus.openaps.iob).toFixed(2)}U`
        : null;
  const cob =
    deviceStatus?.cob !== undefined
      ? `${deviceStatus.cob}g`
      : deviceStatus?.openaps?.cob
        ? `${deviceStatus.openaps.cob}g`
        : null;
  const basal = deviceStatus?.basal !== undefined ? `${deviceStatus.basal}U` : null;

  // Ensure hours selector navigation uses query param
  const _hoursOptions = [2, 3, 4, 6, 12, 24];
  const pathname = usePathname();
  const handleHoursChange = (h: number) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("hours", String(h));
    router.replace(`${pathname}?${params.toString()}`);
  };

  return (
    <>
      <AuthPrompt
        isOpen={showAuthPrompt}
        onAuthenticated={handleAuthenticated}
        onCancel={handleAuthCancel}
        errorMessage={authError}
      />
      <main className="grid h-[92vh] grid-rows-[30%_70%] overflow-hidden">
        <div className="flex items-stretch overflow-hidden px-6 py-3">
          <CurrentReadingPanel
          glucose={mostRecentEntry ? `${Math.round(mostRecentEntry.mgdl)}` : "—"}
          direction={mostRecentEntry?.direction ?? "→"}
          directionLabel={directionLabel ?? undefined}
          timestamp={mostRecentEntry ? new Date(mostRecentEntry.measuredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : undefined}
          recency={
            mostRecentEntry
              ? (() => {
                  const diff = now - new Date(mostRecentEntry.measuredAt).getTime();
                  const mins = Math.max(0, Math.round(diff / 60000));
                  if (mins < 1) return "Just now";
                  return `${mins} min${mins === 1 ? "" : "s"} ago`;
                })()
              : undefined
          }
          state={status.state}
          delta={delta ?? undefined}
          iob={iob ?? undefined}
          cob={cob ?? undefined}
          basal={basal ?? undefined}
          pump={pumpReservoir ?? undefined}
          battery={battery ?? undefined}
          openaps={openApsStatus ?? undefined}
          dbUsage="—"
          selectedHours={selectedHours}
          onSelectHours={handleHoursChange}
          debugPanel={
            debugInfo ? (
              <BasalDebugPanel
                data={debugInfo.data}
                activePointInfo={debugInfo.activePointInfo}
                activeTimestamp={debugInfo.activeTimestamp}
              />
            ) : undefined
          }
        />
      </div>

      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex-3 min-h-0 overflow-hidden border border-slate-800/70 bg-slate-900/60">
          <ShortTermChart
            entries={shortTermEntries}
            basalData={basalData}
            treatments={treatments}
            thresholds={thresholds}
            selectedHours={selectedHours}
            startTime={selectedTimeRange.startTime}
            endTime={selectedTimeRange.endTime}
            onDebugInfo={handleDebugInfo}
          />
        </div>
        <div className="flex-2 min-h-0 overflow-hidden border border-slate-800/70 bg-slate-900/60">
          <LongTermOverviewChart
            entries={longTermEntries}
            thresholds={thresholds}
            selectedStartTime={selectedTimeRange.startTime}
            selectedEndTime={selectedTimeRange.endTime}
            onSelectionChange={handleSelectionChange}
          />
        </div>
      </div>
    </main>
    </>
  );
}
