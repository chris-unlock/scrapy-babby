import { getQueue, saveQueue, getScope, saveScope } from './utils/storage.js';
import { getHostname, filterUrlsForQueue, QUEUE_LIMIT } from './utils/urls.js';

function setStatus(text) {
    document.getElementById('status-msg').textContent = text;
}

async function refreshQueueCount() {
    const queue = await getQueue();
    document.getElementById('queue-count').textContent = queue.length;
    return queue;
}

function intakeStatus(result) {
    const extras = [];
    if (result.filtered) extras.push(`${result.filtered} filtered`);
    if (result.duplicates) extras.push(`${result.duplicates} duplicates`);
    if (result.overflow) extras.push(`${result.overflow} over the ${QUEUE_LIMIT}-page limit`);
    return `Added ${result.accepted.length} page${result.accepted.length === 1 ? '' : 's'}` +
        (extras.length ? ` (${extras.join(', ')})` : '');
}

// Filter candidates, merge into the stored queue, report what happened.
async function addToQueue(candidates, { requiredHost = null } = {}) {
    const existingQueue = await getQueue();
    const linkedInSafe = document.getElementById('toggle-linkedin-safe').checked;
    const result = filterUrlsForQueue(candidates, { existingQueue, linkedInSafe, requiredHost });
    if (result.accepted.length > 0) {
        await saveQueue(existingQueue.concat(result.accepted));
        await refreshQueueCount();
    }
    setStatus(intakeStatus(result));
    return result;
}

// --- Sitemap fetching (runs here in the popup: the MV3 service worker has no DOMParser) ---

async function fetchXml(url) {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('response is not valid XML');
    return doc;
}

// <loc> children of <url> (urlset) or <sitemap> (sitemapindex); excludes image:loc etc.
function sitemapLocs(doc) {
    return Array.from(doc.getElementsByTagName('loc'))
        .filter(n => n.parentNode && (n.parentNode.nodeName === 'url' || n.parentNode.nodeName === 'sitemap'))
        .map(n => n.textContent.trim())
        .filter(Boolean);
}

async function collectSitemapUrls(sitemapUrl, limit) {
    const doc = await fetchXml(sitemapUrl);
    const rootName = doc.documentElement.nodeName.toLowerCase();

    if (rootName === 'sitemapindex') {
        // Follow child sitemaps one level deep, politely paced, until the limit is hit.
        const urls = [];
        for (const childUrl of sitemapLocs(doc)) {
            if (urls.length >= limit) break;
            await new Promise(r => setTimeout(r, 1000));
            setStatus(`Fetching child sitemap: ${childUrl}`);
            try {
                const childDoc = await fetchXml(childUrl);
                urls.push(...sitemapLocs(childDoc));
            } catch (e) { /* skip unreadable child sitemap */ }
        }
        return urls.slice(0, limit);
    }

    return sitemapLocs(doc).slice(0, limit);
}

async function importSitemap() {
    const input = document.getElementById('sitemap-url');
    const sitemapUrl = input.value.trim();
    if (!sitemapUrl) {
        setStatus('Enter a sitemap URL first.');
        return;
    }

    const btn = document.getElementById('btn-fetch-sitemap');
    btn.disabled = true;
    setStatus('Fetching sitemap…');
    try {
        const urls = await collectSitemapUrls(sitemapUrl, QUEUE_LIMIT);
        if (urls.length === 0) {
            setStatus('No page URLs found in that sitemap.');
            return;
        }
        const sameOrigin = document.getElementById('toggle-same-origin').checked;
        await addToQueue(urls, { requiredHost: sameOrigin ? getHostname(sitemapUrl) : null });
    } catch (e) {
        setStatus(`Could not read sitemap: ${e.message}`);
    } finally {
        btn.disabled = false;
    }
}

// --- Wiring ---

document.addEventListener('DOMContentLoaded', async () => {
    await refreshQueueCount();

    // Capture scope applies to single captures, queue runs, and the keyboard shortcut.
    const scopeSelect = document.getElementById('capture-scope');
    scopeSelect.value = await getScope();
    scopeSelect.addEventListener('change', () => saveScope(scopeSelect.value));

    const linkedInToggle = document.getElementById('toggle-linkedin-safe');
    const linkedInWarning = document.getElementById('linkedin-warning');
    const syncLinkedInWarning = () => {
        linkedInWarning.style.display = linkedInToggle.checked ? 'block' : 'none';
    };
    linkedInToggle.addEventListener('change', syncLinkedInWarning);
    syncLinkedInWarning();

    // Single-page capture buttons
    const captureButtons = [
        ['btn-capture-text-images', 'text-images'],
        ['btn-capture-text', 'text'],
        ['btn-capture-images', 'images']
    ];
    for (const [id, mode] of captureButtons) {
        document.getElementById(id).addEventListener('click', () => {
            chrome.runtime.sendMessage({ type: 'PROCESS_CURRENT_TAB', mode, scope: scopeSelect.value });
            window.close();
        });
    }

    document.getElementById('btn-add-queue').addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url) {
            await addToQueue([tab.url]);
        }
    });

    // Sitemap panel
    document.getElementById('btn-import-sitemap').addEventListener('click', async () => {
        const panel = document.getElementById('sitemap-panel');
        const showing = panel.style.display !== 'none';
        panel.style.display = showing ? 'none' : 'block';
        if (!showing) {
            const input = document.getElementById('sitemap-url');
            if (!input.value) {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                const host = tab && tab.url ? getHostname(tab.url) : '';
                if (host && host !== 'unknown-host') input.value = `https://${host}/sitemap.xml`;
            }
            input.focus();
        }
    });
    document.getElementById('btn-fetch-sitemap').addEventListener('click', importSitemap);

    // Paste-links panel
    document.getElementById('btn-paste-links').addEventListener('click', () => {
        const panel = document.getElementById('paste-panel');
        const showing = panel.style.display !== 'none';
        panel.style.display = showing ? 'none' : 'block';
        if (!showing) document.getElementById('paste-links-input').focus();
    });
    document.getElementById('btn-add-links').addEventListener('click', async () => {
        const textarea = document.getElementById('paste-links-input');
        const candidates = textarea.value.split('\n').map(l => l.trim()).filter(Boolean);
        if (candidates.length === 0) {
            setStatus('Paste at least one URL first.');
            return;
        }
        // No same-origin filter here: pasting a list is explicit intent.
        const result = await addToQueue(candidates);
        if (result.accepted.length > 0) textarea.value = '';
    });

    document.getElementById('btn-run-queue').addEventListener('click', () => {
        const linkedInSafe = linkedInToggle.checked;
        const mode = document.getElementById('queue-mode').value;
        chrome.runtime.sendMessage({
            type: 'START_QUEUE',
            options: { mode, linkedInSafe, scope: scopeSelect.value }
        });
        document.getElementById('btn-cancel-queue').disabled = false;
        document.getElementById('btn-run-queue').disabled = true;
    });

    document.getElementById('btn-cancel-queue').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'CANCEL_QUEUE' });
        window.close();
    });

    document.getElementById('btn-clear-queue').addEventListener('click', async () => {
        await saveQueue([]);
        await refreshQueueCount();
        setStatus('Queue cleared');
    });

    // Listen for status updates to update UI
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'QUEUE_STATUS_UPDATE') {
            setStatus(msg.text);
            refreshQueueCount();
        }
    });
});
