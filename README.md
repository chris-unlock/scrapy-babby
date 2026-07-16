# scrapy babby

A secure, local-only Manifest V3 Chrome Extension to manually capture reading material from the web straight to your Downloads folder.

## Installation (Unpacked)
1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** in the top right.
3. Click **Load unpacked** and select the `/extension/` folder in this repository. 
   *(Note: The folder name doesn't matter for the extension's name in Chrome, as Chrome reads the name "scrapy babby" directly from the `manifest.json`. You can leave the folder named `extension`!)*

## Usage
- **Capture scope** (applies to everything, including the keyboard shortcut; remembered between sessions):
  - **Main content only** (default) — extracts the page's `<main>` landmark, falling back to Readability's article detection. Skips headers, footers, nav, and sidebars.
  - **Full page (everything)** — the whole body, minus obvious chrome (nav/footer/cookie banners are still stripped).
- **Single Page Capture**: Click the extension icon and pick a capture mode, or hit `Ctrl+Shift+S` (text only):
  - **Capture page (text + images)** — content.md (with local image paths), content.txt, meta.json, links.json, and an `images/` folder with a manifest.
  - **Capture page (text only)** — the same minus images.
  - **Capture page (images only)** — just the `images/` folder, its manifest, and meta.json (for source URL + capture date).
- **Queue**: Fill the queue up to **50 pages**, pick a capture type for the run, then hit Run Queue. Ways to add pages:
  - **Add current page** from the popup, or right-click any link → "Add Link to Queue".
  - **Import sitemap…** — point it at a site's `sitemap.xml` (sitemap indexes are followed one level deep). With "Same-origin only" checked, only URLs on the sitemap's own host are accepted.
  - **Paste links…** — one URL per line.
  Invalid URLs and duplicates are filtered at intake, and **Clear queue** empties it. Queue runs pace themselves with randomized 2.5–4.5 second delays between pages (4–7 seconds for runs over 20 pages) to stay polite and avoid tripping bot detection. The extension icon shows a badge with the remaining page count while a run is active.
- **File Output**: Folders are named from the page's URL path, so `https://example.com/services/web-design/` captured today lands in:
  `Downloads/scrapy-babby/example.com/2026-07-15/services-web-design/`
  (The homepage becomes `home`. Re-capturing the same page on the same day overwrites the earlier capture.)

## Limitations & Known Issues
- **Single Page Apps (SPAs)**: The extension waits 2 seconds for JS rendering, but heavily delayed loading elements may be missed.
- **CORS/Authentication**: Since everything occurs inside the current logged-in browser, captures view what you view, circumventing normal scraper blocks.

## LinkedIn & Responsible Use
Automated scraping triggers abuse mechanisms very quickly on platforms like LinkedIn. This extension ships with a **LinkedIn Safe Mode** enabled by default that keeps LinkedIn URLs out of queues (rejected at intake and skipped at run time), enforcing manual user-clicking only to protect your account standing.
