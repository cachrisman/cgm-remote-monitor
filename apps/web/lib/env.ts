const FALLBACK_API_BASE_URL = "http://localhost:1337/api/v1";

function sanitizeBaseUrl(url: string) {
  return url.replace(/\/$/, "");
}

export function getApiBaseUrl() {
  const explicit =
    process.env.NEXT_PUBLIC_NIGHTSCOUT_API_BASE_URL ??
    process.env.NIGHTSCOUT_API_BASE_URL;

  if (explicit && explicit.trim().length > 0) {
    return sanitizeBaseUrl(explicit.trim());
  }

  return sanitizeBaseUrl(FALLBACK_API_BASE_URL);
}
