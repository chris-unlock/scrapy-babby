export async function getQueue() {
    const data = await chrome.storage.local.get('snapper_queue');
    return data.snapper_queue || [];
}

export async function saveQueue(queue) {
    await chrome.storage.local.set({ snapper_queue: queue });
}

// Capture scope: 'main' (main content area) or 'full' (whole page minus chrome).
export async function getScope() {
    const data = await chrome.storage.local.get('snapper_scope');
    return data.snapper_scope || 'main';
}

export async function saveScope(scope) {
    await chrome.storage.local.set({ snapper_scope: scope });
}
