import { slugify, urlToSlug } from './utils/slug.js';
import { getHostname, isLinkedIn, QUEUE_LIMIT } from './utils/urls.js';
import { getQueue, saveQueue, getScope } from './utils/storage.js';

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
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (tabs[0]) extractAndDownload(tabs[0], 'text', await getScope());
        });
    }
});

// Message Routing
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'PROCESS_CURRENT_TAB') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) extractAndDownload(tabs[0], request.mode || 'text', request.scope);
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
    if (queue.length < QUEUE_LIMIT && !queue.includes(url)) {
        queue.push(url);
        await saveQueue(queue);
    }
}

// Jittered politeness delay: exact fixed intervals look robotic. Longer runs pace slower.
function queueDelayMs(totalPagesAtStart) {
    return totalPagesAtStart > 20
        ? 4000 + Math.random() * 3000   // 4–7s
        : 2500 + Math.random() * 2000;  // 2.5–4.5s
}

function setBadge(remaining) {
    chrome.action.setBadgeBackgroundColor({ color: '#0066cc' }).catch(() => { });
    chrome.action.setBadgeText({ text: remaining > 0 ? String(remaining) : '' }).catch(() => { });
}

async function runQueue(options = {}) {
    if (isQueueRunning) return;
    isQueueRunning = true;
    cancelRequested = false;

    const mode = options.mode || 'text-images';
    const scope = options.scope;
    let queue = await getQueue();
    const totalAtStart = queue.length;

    while (queue.length > 0 && !cancelRequested) {
        const targetUrl = queue[0];
        setBadge(queue.length);

        // Backstop: intake filtering should have caught these already.
        if (options.linkedInSafe && isLinkedIn(targetUrl)) {
            broadcastStatus(`Skipped LinkedIn URL in queue (Safe Mode)`);
            queue.shift();
            await saveQueue(queue);
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
            await extractAndDownload(tab, mode, scope);
        }

        // Cleanup
        await chrome.tabs.remove(tab.id);
        queue.shift();
        await saveQueue(queue);

        if (queue.length > 0 && !cancelRequested) {
            await new Promise(r => setTimeout(r, queueDelayMs(totalAtStart)));
        }
    }

    isQueueRunning = false;
    setBadge(0);
    broadcastStatus(cancelRequested ? "Queue cancelled" : "Queue finished");
}

function broadcastStatus(text) {
    chrome.runtime.sendMessage({ type: 'QUEUE_STATUS_UPDATE', text }).catch(() => { });
}

function dataToDataUrl(data, mime) {
    const encoded = encodeURIComponent(data);
    return `data:${mime};charset=utf-8,${encoded}`;
}

async function extractAndDownload(tab, mode, scope = 'main') {
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

    const wantText = mode !== 'images';
    const wantImages = mode !== 'text';

    try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT', mode, scope });
        if (!response) return;

        const capturedAt = new Date().toISOString();
        const ymd = capturedAt.split('T')[0];

        // Name folders from the URL the content script reports (window.location.href).
        // Queue tabs are created from a pre-navigation snapshot whose tab.url is still
        // empty, so trusting tab.url sent every queued page to unknown-host/home.
        const pageUrl = response.meta.source_url || tab.url || tab.pendingUrl || '';
        const host = getHostname(pageUrl);

        // Folder named from the URL path; same-day re-captures of a page intentionally overwrite.
        const folderPath = `scrapy-babby/${host}/${ymd}/${urlToSlug(pageUrl)}`;

        // Record how this capture was made (useful to agents consuming meta.json).
        response.meta.capture_mode = mode;
        response.meta.capture_scope = scope;

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

        if (wantText) {
            // Download Markdown (image mode re-downloads after path rewriting)
            if (!wantImages) {
                chrome.downloads.download({
                    url: dataToDataUrl(frontmatter + response.markdown, 'text/markdown'),
                    filename: `${folderPath}/content.md`,
                    conflictAction: 'overwrite'
                });
            }

            // Download Text fallback
            chrome.downloads.download({
                url: dataToDataUrl(response.text, 'text/plain'),
                filename: `${folderPath}/content.txt`,
                conflictAction: 'overwrite'
            });

            // Download Links
            chrome.downloads.download({
                url: dataToDataUrl(JSON.stringify(response.links, null, 2), 'application/json'),
                filename: `${folderPath}/links.json`,
                conflictAction: 'overwrite'
            });
        }

        // Meta is saved in every mode — it gives agents the source URL + capture date.
        chrome.downloads.download({
            url: dataToDataUrl(JSON.stringify(response.meta, null, 2), 'application/json'),
            filename: `${folderPath}/meta.json`,
            conflictAction: 'overwrite'
        });

        // Optional Images processing
        if (wantImages && response.images.length > 0) {
            let updatedMarkdown = response.markdown;
            const imageManifest = [];
            let imgCount = 1;

            for (const imgObj of response.images) {
                try {
                    const urlObj = new URL(imgObj.src);
                    const extMatch = urlObj.pathname.match(/\.(png|jpe?g|gif|webp|svg|avif)$/i);
                    const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
                    const altSlug = imgObj.alt
                        ? slugify(imgObj.alt).substring(0, 40)
                        : slugify(urlObj.pathname.split('/').pop().replace(/\.[^.]+$/, '') || 'img').substring(0, 40);
                    const safeName = imgCount.toString().padStart(3, '0') + '-' + (altSlug || 'img') + '.' + ext;

                    chrome.downloads.download({
                        url: imgObj.src,
                        filename: `${folderPath}/images/${safeName}`,
                        conflictAction: 'overwrite'
                    });

                    // Rewrite markdown reference to local path
                    const escapedUrl = imgObj.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    updatedMarkdown = updatedMarkdown.replace(
                        new RegExp(`!\\[([^\\]]*)\\]\\(${escapedUrl}\\)`, 'g'),
                        `![$1](./images/${safeName})`
                    );

                    imageManifest.push({ localPath: safeName, src: imgObj.src, alt: imgObj.alt, width: imgObj.width, height: imgObj.height });
                    imgCount++;
                } catch (e) { /* skip malformed URL */ }
            }

            // Download content.md with local image paths
            if (wantText) {
                chrome.downloads.download({
                    url: dataToDataUrl(frontmatter + updatedMarkdown, 'text/markdown'),
                    filename: `${folderPath}/content.md`,
                    conflictAction: 'overwrite'
                });
            }

            // Download image manifest
            chrome.downloads.download({
                url: dataToDataUrl(JSON.stringify(imageManifest, null, 2), 'application/json'),
                filename: `${folderPath}/images/manifest.json`,
                conflictAction: 'overwrite'
            });
        }
    } catch (e) {
        console.error("Extraction response failed", e);
    }
}
