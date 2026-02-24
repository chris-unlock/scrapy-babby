# scrapy babby

A secure, local-only Manifest V3 Chrome Extension to manually capture reading material from the web straight to your Downloads folder.

## Installation (Unpacked)
1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** in the top right.
3. Click **Load unpacked** and select the `/extension/` folder in this repository. 
   *(Note: The folder name doesn't matter for the extension's name in Chrome, as Chrome reads the name "scrapy babby" directly from the `manifest.json`. You can leave the folder named `extension`!)*

## Usage
- **Single Page Capture**: Click the extension icon and select "Capture Page", or hit `Ctrl+Shift+S`.
- **Link Queue**: Right-click any link to add it to your queue. Open the popup to run the queue automatically parsing sequentially in a background tab.
- **File Output**: Navigating to your computer's `Downloads` folder, you will find files structured as:
  `Downloads/scrapy-babby/example.com/2026-02-23/article-title-a1b2c3d4/`

## Limitations & Known Issues
- **Single Page Apps (SPAs)**: The extension waits 2 seconds for JS rendering, but heavily delayed loading elements may be missed.
- **Screenshots**: Full-page stitching is highly complex due to varying CSS layouts (sticky headers, etc.). It prioritizes reliability by capturing the immediate visible viewport via `screenshot-viewport.png`.
- **CORS/Authentication**: Since everything occurs inside the current logged-in browser, captures view what you view, circumventing normal scraper blocks.

## LinkedIn & Responsible Use
Automated scraping triggers abuse mechanisms very quickly on platforms like LinkedIn. This extension ships with a **LinkedIn Safe Mode** enabled by default that prevents URL queues from executing on their domain, enforcing manual user-clicking only to protect your account standing.
