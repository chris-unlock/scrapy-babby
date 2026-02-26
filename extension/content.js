const LI_SECTION_IDS = [
    'about', 'experience', 'education', 'skills',
    'certifications', 'volunteer', 'languages', 'courses',
    'projects', 'honors', 'publications', 'recommendations', 'activity'
];

const REMOVE_SELECTORS = [
    'nav', 'header', 'footer', 'aside', 'script', 'style', 'noscript', 'iframe',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[role="complementary"]', '[role="search"]',
    '.nav', '.navigation', '.menu', '.site-header', '.site-footer', '.sidebar', '.widget-area',
    '.cookie-banner', '.cookie-notice', '.breadcrumb', '.breadcrumbs', '.social-share',
    '.related-posts', '.comments', '#comments', '.advertisement', '.popup', '.modal',
    '.overlay', '.skip-link', '.screen-reader-text', '#wpadminbar',
    '[class*="wp-block-navigation"]', '[class*="wp-block-site-header"]',
    '[class*="wp-block-site-footer"]', '[class*="wp-block-template-part"]'
].join(', ');

function extractMeta() {
    const meta = {
        source_url: window.location.href,
        canonical_url: document.querySelector('link[rel="canonical"]')?.href || '',
        title: document.title,
        site_name: document.querySelector('meta[property="og:site_name"]')?.content || '',
        lang: document.documentElement.lang || '',
        byline: '',
        published_at: document.querySelector('meta[name*="date"], meta[property="article:published_time"]')?.content || '',
        word_count: 0,
        excerpt: ''
    };

    try {
        if (typeof window.Readability !== 'undefined') {
            const docClone = document.cloneNode(true);
            const article = new window.Readability(docClone).parse();
            if (article) {
                meta.byline = article.byline || '';
                meta.title = article.title || meta.title;
                meta.site_name = article.siteName || meta.site_name;
                meta.published_at = article.publishedTime || meta.published_at;
                meta.excerpt = article.excerpt || '';
            }
        }
    } catch (e) {
        console.log('Readability meta extraction failed', e);
    }

    return meta;
}

function buildCleanDom() {
    const clone = document.body.cloneNode(true);

    // Remove hidden elements
    clone.querySelectorAll('*').forEach(el => {
        const style = el.getAttribute('style') || '';
        if (
            /display\s*:\s*none/i.test(style) ||
            /visibility\s*:\s*hidden/i.test(style) ||
            el.hasAttribute('hidden') ||
            el.getAttribute('aria-hidden') === 'true'
        ) {
            el.remove();
        }
    });

    // Remove structural chrome
    clone.querySelectorAll(REMOVE_SELECTORS).forEach(el => el.remove());

    // Remove empty block containers (walk in reverse to catch inner before outer)
    const blocks = Array.from(clone.querySelectorAll('div, section, article, main'));
    for (let i = blocks.length - 1; i >= 0; i--) {
        const el = blocks[i];
        if (!el.isConnected) continue;
        if (el.textContent.trim().length === 0 && el.querySelector('img') === null) {
            el.remove();
        }
    }

    return clone;
}

function collectImages(includeImages) {
    if (!includeImages) return [];

    const PLACEHOLDER_RE = /placeholder|blank|spacer|pixel|1x1|loading/i;
    const seen = new Set();
    const results = [];

    document.querySelectorAll('img').forEach(img => {
        let src = '';

        if (img.currentSrc && !img.currentSrc.startsWith('data:') && !PLACEHOLDER_RE.test(img.currentSrc)) {
            src = img.currentSrc;
        } else {
            for (const attr of ['data-src', 'data-lazy', 'data-lazy-src', 'data-original']) {
                const val = img.getAttribute(attr);
                if (val && !val.startsWith('data:') && !PLACEHOLDER_RE.test(val)) {
                    src = val;
                    break;
                }
            }
            if (!src) {
                const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';
                if (srcset) {
                    const first = srcset.trim().split(/\s*,\s*/)[0].trim().split(/\s+/)[0];
                    if (first && !first.startsWith('data:')) src = first;
                }
            }
        }

        if (!src || src.startsWith('data:')) return;

        try {
            src = new URL(src, window.location.origin).href;
        } catch (e) {
            return;
        }

        if (seen.has(src)) return;

        const rect = img.getBoundingClientRect();
        const w = rect.width || img.naturalWidth || 0;
        const h = rect.height || img.naturalHeight || 0;
        if (w < 100 || h < 100) return;

        seen.add(src);
        results.push({ src, alt: img.alt || '', width: Math.round(w), height: Math.round(h) });
    });

    return results;
}

function configureTurndown() {
    const td = new window.TurndownService({
        headingStyle: 'atx',
        bulletListMarker: '-',
        codeBlockStyle: 'fenced',
        hr: '---',
        emDelimiter: '_',
        strongDelimiter: '**',
        linkStyle: 'inlined'
    });

    td.addRule('remove-cruft', {
        filter: ['script', 'style', 'noscript', 'iframe', 'svg'],
        replacement: () => ''
    });

    td.addRule('wp-figure', {
        filter: 'figure',
        replacement: (content) => `\n\n${content.trim()}\n\n`
    });

    td.addRule('wp-columns', {
        filter: (node) => node.nodeName === 'DIV' && node.className &&
            (node.className.includes('wp-block-columns') || node.className.includes('wp-block-column')),
        replacement: (content) => `\n\n${content.trim()}\n\n`
    });

    td.addRule('cta-button', {
        filter: (node) => node.nodeName === 'A' && node.className && /\b(btn|button|cta)/i.test(node.className),
        replacement: (content, node) => {
            const href = node.getAttribute('href') || '';
            let absHref = href;
            try { absHref = new URL(href, window.location.origin).href; } catch (e) {}
            return `**[${content.trim()}](${absHref})**`;
        }
    });

    td.addRule('double-br', {
        filter: (node) => node.nodeName === 'BR' && node.nextSibling && node.nextSibling.nodeName === 'BR',
        replacement: () => '\n\n'
    });

    td.addRule('images', {
        filter: 'img',
        replacement: (content, node) => {
            let src = node.getAttribute('src') || '';
            if (src.startsWith('data:')) return '';
            try { src = new URL(src, window.location.origin).href; } catch (e) { return ''; }
            const alt = node.getAttribute('alt') || '';
            return `![${alt}](${src})`;
        }
    });

    return td;
}

function cleanMarkdown(raw) {
    return raw
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, (match, ch) => {
            return /[*_`[\]()#>|]/.test(ch) ? match : ch;
        })
        .split('\n').map(line => line.trimEnd()).join('\n')
        .trim();
}

function isLinkedInProfile() {
    return /linkedin\.com\/in\//i.test(window.location.href);
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function prepareLinkedInProfile() {
    // Phase A — Scroll to bottom to trigger lazy-loaded sections
    let attempts = 0;
    while (attempts < 15) {
        const prevHeight = document.body.scrollHeight;
        window.scrollTo(0, prevHeight);
        await wait(500);
        if (document.body.scrollHeight <= prevHeight) break;
        attempts++;
    }
    // Scroll back to top for clean UX
    window.scrollTo(0, 0);

    // Phase B — Click all "see more" / "show more" expanders
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
    for (const btn of buttons) {
        if (btn.closest('nav')) continue;
        if (btn.getAttribute('role') === 'tab') continue;
        const label = ((btn.innerText || '') + ' ' + (btn.getAttribute('aria-label') || '')).toLowerCase();
        if (label.includes('see more') || label.includes('show more')) {
            btn.click();
        }
    }
    await wait(600);
}

function cleanLinkedInText(str) {
    return str
        .replace(/^See all \d[\d,]* (connections?|followers?|posts?)[^\n]*$/gim, '')
        .replace(/^Show all \d[\d,]*[^\n]*$/gim, '')
        .replace(/^(Connect|Message|Follow|More|Save|Like|Share|Comment|Send|Repost)\s*$/gim, '')
        .replace(/^Add \w+.*$/gim, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function extractLinkedInProfile() {
    const parts = [];

    // Top card — name, headline, location
    const h1 = document.querySelector('h1');
    if (h1) {
        const topSection = h1.closest('section') || h1.closest('div');
        if (topSection) {
            const clone = topSection.cloneNode(true);
            clone.querySelectorAll('button').forEach(el => el.remove());
            clone.querySelectorAll('[data-view-name*="action"]').forEach(el => el.remove());
            const topText = cleanLinkedInText(clone.innerText.trim());
            if (topText) parts.push(topText);
        }
    }

    // Profile sections
    for (const id of LI_SECTION_IDS) {
        const wrapper = document.getElementById(id);
        if (!wrapper) continue;

        const contentEl = wrapper.querySelector('section') || wrapper;
        const clone = contentEl.cloneNode(true);

        clone.querySelectorAll('button').forEach(el => el.remove());
        clone.querySelectorAll('[aria-label*="Edit"]').forEach(el => el.remove());
        clone.querySelectorAll('[aria-label*="Add"]').forEach(el => el.remove());
        clone.querySelectorAll('.pvs-list__footer-wrapper').forEach(el => el.remove());

        const h2El = clone.querySelector('h2');
        const heading = h2El ? h2El.innerText.trim() : id.charAt(0).toUpperCase() + id.slice(1);

        let bodyText = cleanLinkedInText(clone.innerText.trim());

        // Strip first line if it duplicates the heading (innerText includes the h2)
        const firstLine = bodyText.split('\n')[0].trim();
        if (firstLine.toLowerCase() === heading.toLowerCase()) {
            bodyText = bodyText.substring(firstLine.length).replace(/^\n+/, '').trim();
        }

        if (bodyText) {
            parts.push(`## ${heading}\n\n${bodyText}`);
        }
    }

    const joined = parts.join('\n\n---\n\n');
    return { markdown: joined, text: joined };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'EXTRACT') {
        (async () => {
            const meta = extractMeta();
            const imageObjects = collectImages(request.includeImages || false);

            let markdown = '', text = '', links = [];

            if (isLinkedInProfile()) {
                // Clean notification badge from title e.g. "(24) Chad Goodwin | LinkedIn"
                meta.title = meta.title.replace(/^\(\d+\)\s*/, '');

                // Prepare: scroll to load lazy sections, click "see more" expanders
                await prepareLinkedInProfile();

                // Extract structured profile markdown
                const result = extractLinkedInProfile();
                markdown = result.markdown;
                text = result.text;

                // Collect links from main/section only (skip nav links)
                links = [...new Set(
                    Array.from(document.querySelectorAll('main a, section a'))
                        .map(a => {
                            try { return new URL(a.getAttribute('href') || '', window.location.origin).href; }
                            catch(e) { return ''; }
                        })
                        .filter(href => href && !href.includes('/authwall') && !href.startsWith('javascript'))
                )];

            } else {
                // Generic path — unchanged
                const cleanedBody = buildCleanDom();
                const td = configureTurndown();
                try {
                    markdown = cleanMarkdown(td.turndown(cleanedBody));
                } catch (e) {
                    markdown = cleanedBody.innerText + '\n\n[Warning: Turndown Error: ' + e.message + ']';
                }
                text = cleanedBody.innerText;
                links = [...new Set(
                    Array.from(cleanedBody.querySelectorAll('a'))
                        .map(a => {
                            try { return new URL(a.getAttribute('href') || '', window.location.origin).href; }
                            catch(e) { return ''; }
                        })
                        .filter(Boolean)
                )];
            }

            meta.word_count = text.split(/\s+/).filter(Boolean).length;
            meta.excerpt = meta.excerpt || text.substring(0, 200).replace(/\n/g, ' ').trim();

            sendResponse({ meta, markdown, text, links, images: imageObjects });
        })();
        return true; // keep message channel open for async sendResponse
    }
    return true;
});
