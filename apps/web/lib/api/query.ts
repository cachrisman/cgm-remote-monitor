import { type Document, type Filter, ObjectId, type Sort } from "mongodb";

export type QuerySpec = {
  filter: Filter<Document>;
  sort: Sort;
  limit?: number;
};

export type QueryConfig = {
  dateField: string;
  defaultSort: Sort;
  defaultDeltaMs?: number;
  numberFields?: readonly string[];
  useEpochDates?: boolean;
  defaultLimit?: number;
};

const DEFAULT_DELTA_MS = 1000 * 60 * 60 * 24 * 4; // four days
const ID_PATTERN = /^[a-f\d]{24}$/i;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNestedParams(searchParams: URLSearchParams) {
  const result: Record<string, unknown> = {};

  for (const [key, rawValue] of searchParams.entries()) {
    const path = key.replace(/\]/g, "").split("[");
    let cursor: Record<string, unknown> = result;

    path.forEach((segment, index) => {
      const isLeaf = index === path.length - 1;
      if (isLeaf) {
        cursor[segment] = rawValue;
        return;
      }

      const existing = cursor[segment];
      if (isObject(existing)) {
        cursor = existing;
      } else {
        const next: Record<string, unknown> = {};
        cursor[segment] = next;
        cursor = next;
      }
    });
  }

  return result;
}

function coerceNumberLeaves(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(coerceNumberLeaves);
  }

  if (isObject(value)) {
    const clone: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      clone[k] = coerceNumberLeaves(v);
    }
    return clone;
  }

  const coerced = typeof value === "number" ? value : Number(value);
  return Number.isFinite(coerced) ? coerced : value;
}

function applyNumberCoercions(
  filter: Record<string, unknown>,
  fields: readonly string[]
) {
  fields.forEach((field) => {
    if (field in filter) {
      filter[field] = coerceNumberLeaves(filter[field]);
    }
  });
}

function parseDateValue(value: unknown, useEpoch: boolean) {
  if (value instanceof Date) {
    return useEpoch ? value.getTime() : value.toISOString();
  }

  if (typeof value === "number") {
    return useEpoch ? value : new Date(value).toISOString();
  }

  const raw = typeof value === "string" ? value : String(value ?? "");
  const parsedNumber = Number(raw);

  if (Number.isFinite(parsedNumber)) {
    return useEpoch ? parsedNumber : new Date(parsedNumber).toISOString();
  }

  const parsedDate = Date.parse(raw.replace(" ", "+"));
  if (Number.isNaN(parsedDate)) {
    throw new Error(`Cannot parse ${raw} as a valid date`);
  }

  return useEpoch ? parsedDate : new Date(parsedDate).toISOString();
}

function normalizeDateFilter(
  filter: Record<string, unknown>,
  config: QueryConfig
) {
  const dateField = config.dateField;
  const hasId = Boolean(filter._id);
  const hasDate =
    dateField in filter || "dateString" in filter || "sysTime" in filter;

  if (hasDate) {
    const value = filter[dateField];
    if (value !== undefined) {
      if (isObject(value)) {
        const next: Record<string, unknown> = {};
        for (const [key, raw] of Object.entries(value)) {
          next[key] = parseDateValue(raw, Boolean(config.useEpochDates));
        }
        filter[dateField] = next;
      } else {
        filter[dateField] = parseDateValue(value, Boolean(config.useEpochDates));
      }
    }
    return;
  }

  if (hasId) {
    return;
  }

  const delta = config.defaultDeltaMs ?? DEFAULT_DELTA_MS;
  const lowerBound = Date.now() - delta;

  filter[dateField] = {
    $gte: config.useEpochDates ? lowerBound : new Date(lowerBound).toISOString()
  };
}

function coerceObjectId(filter: Record<string, unknown>) {
  if (!filter._id || typeof filter._id !== "string") return;
  if (ID_PATTERN.test(filter._id)) {
    filter._id = new ObjectId(filter._id);
  }
}

function parseSort(raw: unknown, fallback: Sort): Sort {
  if (!isObject(raw)) return fallback;
  const entries = Object.entries(raw).map(([key, value]) => {
    const direction = typeof value === "string" ? Number(value) : value;
    return [key, direction === 1 ? 1 : -1];
  });
  return Object.fromEntries(entries);
}

export function parseQuery(
  searchParams: URLSearchParams,
  config: QueryConfig
): QuerySpec {
  const nested = parseNestedParams(searchParams);

  const filter: Record<string, unknown> =
    (nested.find as Record<string, unknown>) ?? {};

  if (config.numberFields && config.numberFields.length > 0) {
    applyNumberCoercions(filter, config.numberFields);
  }

  coerceObjectId(filter);
  normalizeDateFilter(filter, config);

  const sort = parseSort(nested.sort, config.defaultSort);
  const parsedLimit =
    typeof nested.count === "string" ? Number(nested.count) : undefined;
  const limit =
    parsedLimit && Number.isFinite(parsedLimit)
      ? Math.max(0, parsedLimit)
      : config.defaultLimit;

  return {
    filter,
    sort,
    limit
  };
}
