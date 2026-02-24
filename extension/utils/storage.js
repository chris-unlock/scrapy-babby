export async function getQueue() {
    const data = await chrome.storage.local.get('snapper_queue');
    return data.snapper_queue || [];
}

export async function saveQueue(queue) {
    await chrome.storage.local.set({ snapper_queue: queue });
}
