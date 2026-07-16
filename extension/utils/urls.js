export function getHostname(urlStr) {
    try { return new URL(urlStr).hostname || 'unknown-host'; }
    catch (e) { return 'unknown-host'; }
}

export function isLinkedIn(urlStr) {
    return getHostname(urlStr).includes('linkedin.com');
}

export const QUEUE_LIMIT = 50;

export function isHttpUrl(urlStr) {
    try {
        const u = new URL(urlStr);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (e) {
        return false;
    }
}

// Queue intake filter: the queue should only ever hold clean URLs.
// Returns { accepted, filtered, duplicates, overflow } so callers can report what happened.
export function filterUrlsForQueue(candidates, { existingQueue = [], linkedInSafe = true, requiredHost = null, limit = QUEUE_LIMIT } = {}) {
    const accepted = [];
    let filtered = 0, duplicates = 0, overflow = 0;
    const seen = new Set(existingQueue);

    for (const raw of candidates) {
        const url = (raw || '').trim();
        if (!url) continue;
        if (!isHttpUrl(url)) { filtered++; continue; }
        if (linkedInSafe && isLinkedIn(url)) { filtered++; continue; }
        if (requiredHost && getHostname(url) !== requiredHost) { filtered++; continue; }
        if (seen.has(url)) { duplicates++; continue; }
        if (existingQueue.length + accepted.length >= limit) { overflow++; continue; }
        seen.add(url);
        accepted.push(url);
    }

    return { accepted, filtered, duplicates, overflow };
}
