/**
 * Basal data calculation engine.
 * 
 * Uses profile + temp basal treatments to calculate basal rates (matching legacy app behavior).
 */

export type ProfileStore = {
  dia?: number;
  carbratio?: Array<{ time: string; value: number; timeAsSeconds?: number }>;
  sens?: Array<{ time: string; value: number; timeAsSeconds?: number }>;
  basal?: Array<{ time: string; value: number; timeAsSeconds?: number }>;
  target_low?: Array<{ time: string; value: number; timeAsSeconds?: number }>;
  target_high?: Array<{ time: string; value: number; timeAsSeconds?: number }>;
  timezone?: string;
  [key: string]: unknown;
};

export type ProfileDocument = {
  _id?: string;
  created_at?: string;
  startDate?: string;
  defaultProfile?: string;
  store?: Record<string, ProfileStore>;
  units?: string;
  mills?: number;
  [key: string]: unknown;
};

export type TempBasalTreatment = {
  _id?: string;
  eventType?: string;
  created_at?: string;
  timestamp?: string;
  duration?: number;       // Duration in minutes
  absolute?: number;       // Absolute basal rate in U/hr
  percent?: number;        // Percentage adjustment
  rate?: number;           // Alternative field for absolute rate (some systems use this)
  mills?: number;
  endmills?: number;
  [key: string]: unknown;
};

export type BasalDataPoint = {
  time: number;           // Unix timestamp in ms
  rate: number;           // Effective basal rate in U/hr
  scheduledRate: number;  // Scheduled basal rate from profile
  isTemp: boolean;        // Whether this is a temp basal
};

/**
 * Parse time string like "00:00" to seconds since midnight
 */
function timeToSeconds(timeStr: string): number {
  const parts = timeStr.split(':');
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  const seconds = parseInt(parts[2], 10) || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Get seconds since midnight for a given Date
 */
function dateToSecondsOfDay(date: Date): number {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
}

/**
 * Get scheduled basal rate from profile for a given time
 */
function getScheduledBasal(profile: ProfileStore, time: number): number {
  const basalSchedule = profile.basal;
  if (!basalSchedule || basalSchedule.length === 0) {
    return 0;
  }

  const date = new Date(time);
  const secondsOfDay = dateToSecondsOfDay(date);

  let rate = basalSchedule[0].value;
  
  for (const entry of basalSchedule) {
    const entrySeconds = entry.timeAsSeconds ?? timeToSeconds(entry.time);
    if (entrySeconds <= secondsOfDay) {
      rate = entry.value;
    } else {
      break;
    }
  }

  return rate;
}

/**
 * Process temp basal treatments to add mills and endmills timestamps
 * Matches legacy behavior: includes all temp basals with duration > 0, including absolute: 0 (suspend)
 */
function processTempBasalTreatments(treatments: TempBasalTreatment[]): TempBasalTreatment[] {
  return treatments
    .filter(t => t.eventType && t.eventType.indexOf('Temp Basal') > -1)
    .map(t => {
      const mills = t.mills ?? (t.created_at ? new Date(t.created_at).getTime() : 
                               (t.timestamp ? new Date(t.timestamp).getTime() : 0));
      const durationMs = (t.duration ?? 0) * 60 * 1000;
      return {
        ...t,
        mills,
        endmills: mills + durationMs,
        duration: t.duration ?? 0
      };
    })
    .filter(t => {
      // Include if we have a valid timestamp and duration > 0
      // Note: absolute can be 0 (suspend), which is valid
      return t.mills > 0 && t.duration > 0;
    })
    .sort((a, b) => (a.mills ?? 0) - (b.mills ?? 0));
}

/**
 * Find active temp basal treatment at a given time.
 * When multiple temp basals overlap, returns the most recent one (latest start time).
 * This matches legacy behavior where newer temp basals override older ones.
 */
function findTempBasalTreatment(treatments: TempBasalTreatment[], time: number): TempBasalTreatment | null {
  if (treatments.length === 0) return null;

  // Find all overlapping temp basals, then return the most recent one
  // Since treatments are sorted by mills (start time), we can iterate backwards
  // to find the most recent one that overlaps
  for (let i = treatments.length - 1; i >= 0; i--) {
    const t = treatments[i];
    const startTime = t.mills ?? 0;
    const endTime = t.endmills ?? 0;
    
    // Check if this temp basal is active at the given time
    // Use <= for endTime to include the exact end time (matches original behavior)
    if (time >= startTime && time <= endTime) {
      return t; // Return the most recent (latest start time) overlapping temp basal
    }
    
    // If we've passed all possible overlapping treatments, stop searching
    if (endTime < time) {
      break;
    }
  }

  return null;
}

/**
 * Get effective basal rate at a given time from profile + treatments
 */
function getEffectiveBasal(
  profile: ProfileStore,
  tempTreatments: TempBasalTreatment[],
  time: number
): { rate: number; scheduledRate: number; isTemp: boolean } {
  const scheduledRate = getScheduledBasal(profile, time);
  let effectiveRate = scheduledRate;
  let isTemp = false;

  const treatment = findTempBasalTreatment(tempTreatments, time);
  
  if (treatment) {
    // Check for absolute rate first (including 0 for suspend)
    // The 'rate' field may also be present and should take precedence if absolute is not defined
    if (treatment.absolute !== undefined && !isNaN(treatment.absolute)) {
      effectiveRate = Number(treatment.absolute); // Can be 0 for suspend
      isTemp = true;
    } else if (treatment.rate !== undefined && treatment.rate !== null && !isNaN(Number(treatment.rate))) {
      // Some systems use 'rate' field instead of 'absolute'
      effectiveRate = Number(treatment.rate);
      isTemp = true;
    } else if (treatment.percent !== undefined && !isNaN(treatment.percent)) {
      // Percentage-based temp basal
      effectiveRate = scheduledRate * (100 + treatment.percent) / 100;
      isTemp = true;
    }
    
    if (process.env.NODE_ENV === 'development' && isTemp) {
      // console.log(`[basal] Found active temp basal at ${new Date(time).toISOString()}:`, {
      //   treatmentTime: new Date(treatment.mills ?? 0).toISOString(),
      //   duration: treatment.duration,
      //   absolute: treatment.absolute,
      //   rate: treatment.rate,
      //   percent: treatment.percent,
      //   effectiveRate,
      //   scheduledRate
      // });
    }
  }

  return { rate: effectiveRate, scheduledRate, isTemp };
}

/**
 * Calculate basal data from profile + treatments (legacy behavior)
 * 
 * Matches legacy app: iterates minute-by-minute and only stores points when basal rate changes.
 * This ensures we catch all changes including profile schedule boundaries and temp basal transitions.
 */
export function calculateBasalFromProfile(
  profile: ProfileDocument | null,
  treatments: TempBasalTreatment[],
  startTime: number,
  endTime: number
): BasalDataPoint[] {
  if (!profile) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[basal] No profile provided');
    }
    return [];
  }

  if (!profile.store) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[basal] Profile has no store:', { profileKeys: Object.keys(profile) });
    }
    return [];
  }

  if (!profile.defaultProfile) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[basal] Profile has no defaultProfile:', { 
        storeKeys: Object.keys(profile.store),
        profileKeys: Object.keys(profile)
      });
    }
    return [];
  }

  const activeProfile = profile.store[profile.defaultProfile];
  if (!activeProfile) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[basal] defaultProfile not found in store:', {
        defaultProfile: profile.defaultProfile,
        availableProfiles: Object.keys(profile.store)
      });
    }
    return [];
  }

  if (!activeProfile.basal || activeProfile.basal.length === 0) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[basal] No basal schedule in active profile:', {
        defaultProfile: profile.defaultProfile,
        activeProfileKeys: Object.keys(activeProfile)
      });
    }
    return [];
  }

  const processedTreatments = processTempBasalTreatments(treatments);
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[basal] Processing temp basal treatments:', {
      rawCount: treatments.length,
      processedCount: processedTreatments.length,
      timeWindow: {
        start: new Date(startTime).toISOString(),
        end: new Date(endTime).toISOString()
      },
      treatments: processedTreatments.map(t => ({
        time: new Date(t.mills ?? 0).toISOString(),
        endTime: new Date(t.endmills ?? 0).toISOString(),
        duration: t.duration,
        absolute: t.absolute,
        rate: t.rate,
        percent: t.percent,
        overlapsWindow: (t.mills ?? 0) < endTime && (t.endmills ?? 0) > startTime
      }))
    });
  }
  
  const basalPoints: BasalDataPoint[] = [];
  const ONE_MINUTE = 60 * 1000;
  
  let lastBasal: { rate: number; scheduledRate: number; isTemp: boolean } | null = null;
  let currentTime = startTime;

  // Iterate minute-by-minute (matching legacy app behavior)
  while (currentTime <= endTime) {
    const basal = getEffectiveBasal(activeProfile, processedTreatments, currentTime);
    
    // Only store point when rate changes (matches legacy: if (!_.isEqual(lastbasal, basalvalue)))
    if (!lastBasal || lastBasal.rate !== basal.rate || lastBasal.isTemp !== basal.isTemp) {
      basalPoints.push({
        time: currentTime,
        rate: basal.rate,
        scheduledRate: basal.scheduledRate,
        isTemp: basal.isTemp
      });
      lastBasal = basal;
    }
    
    currentTime += ONE_MINUTE;
  }

  // Ensure final point at endTime (matching legacy app)
  if (basalPoints.length > 0) {
    const finalBasal = getEffectiveBasal(activeProfile, processedTreatments, endTime);
    const lastPoint = basalPoints[basalPoints.length - 1];
    if (lastPoint.time !== endTime || lastPoint.rate !== finalBasal.rate) {
      basalPoints.push({
        time: endTime,
        rate: finalBasal.rate,
        scheduledRate: finalBasal.scheduledRate,
        isTemp: finalBasal.isTemp
      });
    }
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`[basal] Calculated ${basalPoints.length} basal points from ${startTime} to ${endTime}`);
    if (basalPoints.length > 0) {
      console.log(`[basal] First point: ${new Date(basalPoints[0].time).toISOString()} @ ${basalPoints[0].rate}U/hr`);
      console.log(`[basal] Last point: ${new Date(basalPoints[basalPoints.length - 1].time).toISOString()} @ ${basalPoints[basalPoints.length - 1].rate}U/hr`);
      
      // Generate continuous timeline for debugging
      const timeline: Array<{ time: string; timestamp: number; rate: number; scheduledRate: number; isTemp: boolean; source: string }> = [];
      const ONE_MINUTE = 60 * 1000;
      let currentTime = startTime;
      let basalIndex = 0;
      let currentBasal = basalPoints[0];
      
      while (currentTime <= endTime) {
        // Advance to next basal point if we've passed it
        while (basalIndex < basalPoints.length - 1 && currentTime >= basalPoints[basalIndex + 1].time) {
          basalIndex++;
          currentBasal = basalPoints[basalIndex];
        }
        
        timeline.push({
          time: new Date(currentTime).toISOString(),
          timestamp: currentTime,
          rate: currentBasal.rate,
          scheduledRate: currentBasal.scheduledRate,
          isTemp: currentBasal.isTemp,
          source: currentBasal.isTemp ? 'temp basal' : 'scheduled'
        });
        
        currentTime += ONE_MINUTE;
      }
      
      // Group by rate changes for easier reading
      const rateSegments: Array<{ start: string; end: string; duration: string; rate: number; scheduledRate: number; isTemp: boolean }> = [];
      let segmentStart = timeline[0];
      
      for (let i = 1; i < timeline.length; i++) {
        const point = timeline[i];
        if (point.rate !== segmentStart.rate || point.isTemp !== segmentStart.isTemp) {
          const durationMs = point.timestamp - segmentStart.timestamp;
          const durationMins = Math.round(durationMs / 60000);
          rateSegments.push({
            start: segmentStart.time,
            end: timeline[i - 1].time,
            duration: `${durationMins} min`,
            rate: segmentStart.rate,
            scheduledRate: segmentStart.scheduledRate,
            isTemp: segmentStart.isTemp
          });
          segmentStart = point;
        }
      }
      
      // Add final segment
      const lastPoint = timeline[timeline.length - 1];
      const finalDurationMs = lastPoint.timestamp - segmentStart.timestamp;
      const finalDurationMins = Math.round(finalDurationMs / 60000);
      rateSegments.push({
        start: segmentStart.time,
        end: lastPoint.time,
        duration: `${finalDurationMins} min`,
        rate: segmentStart.rate,
        scheduledRate: segmentStart.scheduledRate,
        isTemp: segmentStart.isTemp
      });
      
      console.log('[basal] Continuous timeline (grouped by rate changes):', {
        totalMinutes: Math.round((endTime - startTime) / 60000),
        totalPoints: timeline.length,
        rateSegments: rateSegments,
        fullTimeline: timeline // Full minute-by-minute data if needed
      });
    }
  }

  return basalPoints;
}

/**
 * Calculate basal data using profile + temp basal treatments.
 * 
 * This matches the legacy app behavior - always uses profile.getTempBasal()
 * which combines scheduled basal from profile with temp basal treatments.
 * 
 * If profile doesn't have basal data, returns empty array (user should upload profile).
 */
export function calculateBasalData(
  profile: ProfileDocument | null,
  treatments: TempBasalTreatment[],
  _deviceStatuses: unknown[], // Kept for backward compatibility but not used
  startTime: number,
  endTime: number
): BasalDataPoint[] {
  return calculateBasalFromProfile(profile, treatments, startTime, endTime);
}
