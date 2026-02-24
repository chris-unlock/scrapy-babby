import { slugify } from './utils/slug.js';
import { shortHash } from './utils/hash.js';
import { getHostname, isLinkedIn } from './utils/urls.js';
import { getQueue, saveQueue } from './utils/storage.js';

let isQueueRunning = false;
let cancelRequested = false;

// Setup Context Menu
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "add-to-queue",
        title: "Add Link to Queue",
        contexts: ["link"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "add-to-queue" && info.linkUrl) {
        enqueueUrl(info.linkUrl);
    }
});

// Keyboard command
chrome.commands.onCommand.addListener((command) => {
    if (command === "capture_page") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) extractAndDownload(tabs[0], false);
        });
    }
});

// Message Routing
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'PROCESS_CURRENT_TAB') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) extractAndDownload(tabs[0], request.includeImages);
        });
    } else if (request.type === 'CAPTURE_SCREENSHOT') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) captureScreenshot(tabs[0]);
        });
    } else if (request.type === 'ENQUEUE_URL') {
        enqueueUrl(request.url);
    } else if (request.type === 'START_QUEUE') {
        runQueue(request.options);
    } else if (request.type === 'CANCEL_QUEUE') {
        cancelRequested = true;
    }
});

async function enqueueUrl(url) {
    const queue = await getQueue();
    if (queue.length < 10 && !queue.includes(url)) {
        queue.push(url);
        await saveQueue(queue);
    }
}

async function runQueue(options) {
    if (isQueueRunning) return;
    isQueueRunning = true;
    cancelRequested = false;

    let queue = await getQueue();

    while (queue.length > 0 && !cancelRequested) {
        const targetUrl = queue[0];

        if (options.linkedInSafe && isLinkedIn(targetUrl)) {
            broadcastStatus(`Skipped LinkedIn URL in queue (Safe Mode)`);
            queue.shift();
            continue;
        }

        broadcastStatus(`Processing queue: ${targetUrl}`);

        // Open background tab (inactive)
        const tab = await chrome.tabs.create({ url: targetUrl, active: false });

        // Wait for load + delay
        await new Promise(resolve => {
            chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                if (tabId === tab.id && info.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    setTimeout(resolve, 2000); // 2s SPA delay
                }
            });
        });

        if (!cancelRequested) {
            await extractAndDownload(tab, false);
        }

        // Cleanup
        await chrome.tabs.remove(tab.id);
        queue.shift();
        await saveQueue(queue);

        if (queue.length > 0 && !cancelRequested) {
            await new Promise(r => setTimeout(r, 1500)); // Delay between pages
        }
    }

    isQueueRunning = false;
    broadcastStatus(cancelRequested ? "Queue cancelled" : "Queue finished");
}

function broadcastStatus(text) {
    chrome.runtime.sendMessage({ type: 'QUEUE_STATUS_UPDATE', text }).catch(() => { });
}

async function captureScreenshot(tab) {
    // A simplified, safe viewport capture fallback is implemented as requested to prioritize reliability over complex stitching
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const base64Str = await blobToBase64(blob);

    const capturedAt = new Date().toISOString();
    const hashData = await shortHash(tab.url + capturedAt);
    const slug = slugify(tab.title || "screenshot");
    const ymd = capturedAt.split('T')[0];
    const host = getHostname(tab.url);

    const folderPath = `scrapy-babby/${host}/${ymd}/${slug}-${hashData}`;

    chrome.downloads.download({
        url: 'data:image/png;base64,' + base64Str,
        filename: `${folderPath}/screenshot-viewport.png`,
        conflictAction: 'overwrite'
    });
}

function blobToBase64(blob) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
    });
}

function dataToDataUrl(data, mime) {
    const encoded = encodeURIComponent(data);
    return `data:${mime};charset=utf-8,${encoded}`;
}

async function extractAndDownload(tab, includeImages) {
    // Inject scripts
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['vendor/readability.js', 'vendor/turndown.js', 'content.js']
        });
    } catch (e) {
        console.error("Script injection failed", e);
        return;
    }

    // Wait 2s for SPAs
    await new Promise(r => setTimeout(r, 2000));

    try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT', url: tab.url });
        if (!response) return;

        const capturedAt = new Date().toISOString();
        const hashData = await shortHash(tab.url + capturedAt);
        const slug = slugify(response.meta.title);
        const ymd = capturedAt.split('T')[0];
        const host = getHostname(tab.url);

        const folderPath = `scrapy-babby/${host}/${ymd}/${slug}-${hashData}`;

        // Construct Markdown with Frontmatter
        const frontmatter = `---\n` +
            `source_url: "${response.meta.source_url}"\n` +
            `canonical_url: "${response.meta.canonical_url}"\n` +
            `captured_at: "${capturedAt}"\n` +
            `title: "${response.meta.title.replace(/"/g, '\\"')}"\n` +
            `site_name: "${response.meta.site_name}"\n` +
            `byline: "${response.meta.byline}"\n` +
            `published_at: "${response.meta.published_at}"\n` +
            `lang: "${response.meta.lang}"\n` +
            `word_count: ${response.meta.word_count}\n` +
            `excerpt: "${response.meta.excerpt.replace(/"/g, '\\"')}"\n` +
            `---\n\n`;

        const mdContent = frontmatter + response.markdown;

        // Download Markdown
        chrome.downloads.download({
            url: dataToDataUrl(mdContent, 'text/markdown'),
            filename: `${folderPath}/content.md`,
            conflictAction: 'overwrite'
        });

        // Download Text fallback
        chrome.downloads.download({
            url: dataToDataUrl(response.text, 'text/plain'),
            filename: `${folderPath}/content.txt`,
            conflictAction: 'overwrite'
        });

        // Download Meta
        chrome.downloads.download({
            url: dataToDataUrl(JSON.stringify(response.meta, null, 2), 'application/json'),
            filename: `${folderPath}/meta.json`,
            conflictAction: 'overwrite'
        });

        // Download Links
        chrome.downloads.download({
            url: dataToDataUrl(JSON.stringify(response.links, null, 2), 'application/json'),
            filename: `${folderPath}/links.json`,
            conflictAction: 'overwrite'
        });

        // Optional Images processing (simulated to save state)
        if (includeImages && response.images.length > 0) {
            const imgJson = { total: response.images.length, urls: response.images };
            chrome.downloads.download({
                url: dataToDataUrl(JSON.stringify(imgJson, null, 2), 'application/json'),
                filename: `${folderPath}/images/images.json`,
                conflictAction: 'overwrite'
            });
        }
    } catch (e) {
        console.error("Extraction response failed", e);
    }
}
