import { type Filter, type Sort, type Document } from "mongodb";

/**
 * V3 Query handling module
 * 
 * Handles the filter operators and query parameters defined in the API v3 spec.
 * Filter operators: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $re
 * Sorting: sort, sort$desc
 * Paging: limit, skip
 * Fields: fields
 */

export type V3QuerySpec = {
  filter: Filter<Document>;
  sort: Sort;
  limit: number;
  skip: number;
  fields?: string[];
};

export type V3QueryConfig = {
  defaultLimit?: number;
  maxLimit?: number;
  defaultSort?: Sort;
  dateFields?: string[];
};

const DEFAULT_CONFIG: V3QueryConfig = {
  defaultLimit: 10,
  maxLimit: 1000,
  defaultSort: { srvModified: -1 },
  dateFields: ['date', 'created_at', 'srvModified', 'srvCreated']
};

/**
 * Parse date value - handles epoch (ms or s) and ISO 8601
 */
function parseDateValue(value: string): number | string {
  // Try as epoch in milliseconds
  const numValue = Number(value);
  if (!isNaN(numValue)) {
    // If value looks like seconds (small number), convert to ms
    if (numValue < 10000000000) {
      return numValue * 1000;
    }
    return numValue;
  }
  
  // Try as ISO 8601
  const parsed = Date.parse(value);
  if (!isNaN(parsed)) {
    return parsed;
  }
  
  // Return as-is for string dates
  return value;
}

/**
 * Convert filter value to appropriate type
 */
function convertValue(value: string, fieldName: string, dateFields: string[]): unknown {
  // Handle date fields specially
  if (dateFields.includes(fieldName)) {
    return parseDateValue(value);
  }
  
  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;
  
  // Number
  const numValue = Number(value);
  if (!isNaN(numValue) && value.trim() !== '') {
    return numValue;
  }
  
  return value;
}

/**
 * Parse filter operators from a query parameter name
 * Returns { field, operator } or null if not a filter
 */
function parseFilterParam(paramName: string): { field: string; operator: string } | null {
  // Match patterns like: field$eq, field$gt, etc.
  const match = paramName.match(/^(.+)\$(eq|ne|gt|gte|lt|lte|in|nin|re)$/);
  if (match) {
    return { field: match[1], operator: match[2] };
  }
  
  // Plain field name means $eq
  if (!paramName.includes('$') && !['sort', 'limit', 'skip', 'fields'].includes(paramName)) {
    return { field: paramName, operator: 'eq' };
  }
  
  return null;
}

/**
 * Build MongoDB filter from operator and value
 */
function buildOperatorFilter(
  operator: string,
  value: string,
  fieldName: string,
  dateFields: string[]
): Filter<Document> {
  switch (operator) {
    case 'eq':
      return { $eq: convertValue(value, fieldName, dateFields) };
    case 'ne':
      return { $ne: convertValue(value, fieldName, dateFields) };
    case 'gt':
      return { $gt: convertValue(value, fieldName, dateFields) };
    case 'gte':
      return { $gte: convertValue(value, fieldName, dateFields) };
    case 'lt':
      return { $lt: convertValue(value, fieldName, dateFields) };
    case 'lte':
      return { $lte: convertValue(value, fieldName, dateFields) };
    case 'in': {
      // Split by | for set operations
      const values = value.split('|').map(v => convertValue(v.trim(), fieldName, dateFields));
      return { $in: values };
    }
    case 'nin': {
      const values = value.split('|').map(v => convertValue(v.trim(), fieldName, dateFields));
      return { $nin: values };
    }
    case 're':
      // Regex pattern
      return { $regex: value, $options: 'i' };
    default:
      return { $eq: convertValue(value, fieldName, dateFields) };
  }
}

/**
 * Parse V3 query parameters into MongoDB query spec
 */
export function parseV3Query(
  searchParams: URLSearchParams,
  config: V3QueryConfig = {}
): V3QuerySpec {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const filter: Filter<Document> = {};
  let sort: Sort = mergedConfig.defaultSort || { srvModified: -1 };
  let limit = mergedConfig.defaultLimit || 10;
  let skip = 0;
  let fields: string[] | undefined;

  for (const [key, value] of searchParams.entries()) {
    // Handle sort parameter
    if (key === 'sort') {
      sort = { [value]: 1 };
      continue;
    }
    
    // Handle sort$desc parameter
    if (key === 'sort$desc') {
      sort = { [value]: -1 };
      continue;
    }
    
    // Handle limit parameter
    if (key === 'limit') {
      const parsed = parseInt(value, 10);
      if (!isNaN(parsed) && parsed > 0) {
        limit = Math.min(parsed, mergedConfig.maxLimit || 1000);
      }
      continue;
    }
    
    // Handle skip parameter
    if (key === 'skip') {
      const parsed = parseInt(value, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        skip = parsed;
      }
      continue;
    }
    
    // Handle fields parameter
    if (key === 'fields') {
      if (value !== '_all') {
        fields = value.split(',').map(f => f.trim());
      }
      continue;
    }
    
    // Parse filter operators
    const filterInfo = parseFilterParam(key);
    if (filterInfo) {
      const opFilter = buildOperatorFilter(
        filterInfo.operator,
        value,
        filterInfo.field,
        mergedConfig.dateFields || []
      );
      
      // Merge with existing filter for this field
      if (filter[filterInfo.field]) {
        filter[filterInfo.field] = {
          ...filter[filterInfo.field] as object,
          ...opFilter
        };
      } else {
        filter[filterInfo.field] = opFilter;
      }
    }
  }

  return {
    filter,
    sort,
    limit,
    skip,
    fields
  };
}

/**
 * Apply field projection to documents
 */
export function applyFieldProjection<T extends Document>(
  docs: T[],
  fields?: string[]
): Partial<T>[] {
  if (!fields || fields.length === 0) {
    return docs;
  }
  
  return docs.map(doc => {
    const projected: Partial<T> = {};
    for (const field of fields) {
      if (field in doc) {
        projected[field as keyof T] = doc[field as keyof T];
      }
    }
    // Always include _id and identifier
    if ('_id' in doc) {
      projected['_id' as keyof T] = doc['_id' as keyof T];
    }
    if ('identifier' in doc) {
      projected['identifier' as keyof T] = doc['identifier' as keyof T];
    }
    return projected;
  });
}

/**
 * Build MongoDB projection from fields array
 */
export function buildProjection(fields?: string[]): Document | undefined {
  if (!fields || fields.length === 0) {
    return undefined;
  }
  
  const projection: Document = { _id: 1, identifier: 1 };
  for (const field of fields) {
    projection[field] = 1;
  }
  return projection;
}

