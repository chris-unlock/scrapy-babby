import { getQueue, saveQueue } from './utils/storage.js';

document.addEventListener('DOMContentLoaded', async () => {
    const queue = await getQueue();
    document.getElementById('queue-count').textContent = queue.length;
    
    // Toggle state persistence could be added here
    document.getElementById('toggle-linkedin-safe').addEventListener('change', (e) => {
        document.getElementById('linkedin-warning').style.display = e.target.checked ? 'block' : 'none';
    });

    document.getElementById('btn-capture-text').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'PROCESS_CURRENT_TAB', includeImages: false });
        window.close();
    });

    document.getElementById('btn-capture-images').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'PROCESS_CURRENT_TAB', includeImages: true });
        window.close();
    });

    document.getElementById('btn-capture-screen').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' });
        window.close();
    });

    document.getElementById('btn-add-queue').addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url) {
            chrome.runtime.sendMessage({ type: 'ENQUEUE_URL', url: tab.url });
            window.close();
        }
    });

    document.getElementById('btn-run-queue').addEventListener('click', () => {
        const sameOrigin = document.getElementById('toggle-same-origin').checked;
        const linkedInSafe = document.getElementById('toggle-linkedin-safe').checked;
        chrome.runtime.sendMessage({ 
            type: 'START_QUEUE', 
            options: { sameOrigin, linkedInSafe } 
        });
        document.getElementById('btn-cancel-queue').disabled = false;
        document.getElementById('btn-run-queue').disabled = true;
    });

    document.getElementById('btn-cancel-queue').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'CANCEL_QUEUE' });
        window.close();
    });

    // Listen for status updates to update UI
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'QUEUE_STATUS_UPDATE') {
            document.getElementById('status-msg').textContent = msg.text;
        }
    });
});
