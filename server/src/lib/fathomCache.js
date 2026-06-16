/** In-memory cache for Fathom meeting list to avoid repeated API pagination. */
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

let cache = {
  meetings: null,
  fetchedAt: 0,
};

export function getCachedMeetings() {
  if (!cache.meetings || Date.now() - cache.fetchedAt > CACHE_TTL_MS) return null;
  return cache.meetings;
}

export function setCachedMeetings(meetings) {
  cache = { meetings, fetchedAt: Date.now() };
}

export function getStaleMeetings() {
  return cache.meetings || null;
}

export function clearFathomCache() {
  cache = { meetings: null, fetchedAt: 0 };
}

export function cacheAgeMs() {
  if (!cache.fetchedAt) return null;
  return Date.now() - cache.fetchedAt;
}
