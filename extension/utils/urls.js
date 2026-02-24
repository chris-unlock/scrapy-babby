export function getHostname(urlStr) {
    try { return new URL(urlStr).hostname || 'unknown-host'; }
    catch (e) { return 'unknown-host'; }
}

export function isLinkedIn(urlStr) {
    return getHostname(urlStr).includes('linkedin.com');
}
