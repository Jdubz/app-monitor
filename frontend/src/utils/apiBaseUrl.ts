const DEFAULT_API_BASE_URL = "http://localhost:5000";

const stripTrailingSlashes = (value: string): string => value.replace(/\/+$/, "");

const getRuntimeLocation = (): Location | null => {
  if (typeof window !== "undefined" && window.location) {
    return window.location;
  }

  const globalLocation = (globalThis as { location?: Location }).location;
  return globalLocation ?? null;
};

const getRuntimeOrigin = (): string | null => {
  const location = getRuntimeLocation();
  if (!location) {
    return null;
  }

  if (location.origin) {
    return stripTrailingSlashes(location.origin);
  }

  if (location.protocol && location.host) {
    return stripTrailingSlashes(`${location.protocol}//${location.host}`);
  }

  return null;
};

const normalizeInput = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "/") {
    return "";
  }
  return stripTrailingSlashes(trimmed);
};

const ensureProtocolForSchemeRelative = (value: string): string => {
  const location = getRuntimeLocation();
  const protocol = location?.protocol ?? "https:";
  return `${protocol}${value}`;
};

export const getApiBaseUrl = (): string => {
  const rawValue = import.meta.env?.VITE_API_BASE_URL;

  // In production, default to same origin (empty string means relative URLs)
  // Only use localhost:5000 for development when explicitly not set
  if (rawValue === undefined || rawValue === null) {
    // Use current origin in browser, fallback to localhost only in SSR/test
    return getRuntimeOrigin() ?? DEFAULT_API_BASE_URL;
  }

  const normalized = normalizeInput(rawValue);

  if (normalized === "") {
    return getRuntimeOrigin() ?? DEFAULT_API_BASE_URL;
  }

  if (normalized.startsWith("//")) {
    return stripTrailingSlashes(ensureProtocolForSchemeRelative(normalized));
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  if (normalized.startsWith("/")) {
    const origin = getRuntimeOrigin();
    return origin ? `${origin}${normalized}` : normalized;
  }

  return normalized;
};

export const getApiBasePath = (): string => `${getApiBaseUrl()}/api`;

export { DEFAULT_API_BASE_URL };
