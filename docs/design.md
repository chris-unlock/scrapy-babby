# scrapy babby - Design Document

## Architecture Overview
This extension relies purely on Chrome APIs to guarantee that all execution is local, deterministic, and user-initiated.

- **Background Worker (`background.js`)**: Acts as the central orchestrator. Uses `chrome.downloads` to create formatted folders locally. Handles the queue timer logic.
- **Content Scripts (`content.js`)**: Dynamically injected on user action. Prevents unused background CPU consumption. Scrapes DOM and uses vendored libraries (Readability, Turndown).
- **Communication**: Strict message passing between popup -> background -> content script. Responses pass back the fully extracted objects.

## Capture Scope
Two scopes, persisted in `chrome.storage.local` and applied to single captures, queue runs, and the keyboard shortcut:
- **main** (default): extraction root is the page's `<main>`/`[role=main]` landmark; if none exists, Readability's parsed article HTML; if that fails, the full body. Image collection narrows to the live landmark when one exists.
- **full**: extraction root is `document.body` with structural chrome (nav, header, footer, cookie banners, etc.) stripped — the original behavior.

Folder naming uses the URL reported by the content script (`window.location.href`), not the background's Tab object — tabs created by the queue runner have an empty `tab.url` until navigation commits, which once sent every queued capture to `unknown-host/home`. `meta.json` records `capture_mode` and `capture_scope`.

## Queue Intake
The queue holds at most 50 URLs and only ever holds clean ones — filtering happens when URLs are added, not when the run starts:
- **Sources**: current page, right-click context menu, sitemap import (parsed in the popup, since MV3 service workers lack `DOMParser`; sitemap indexes are followed one level deep), and a paste-a-list textarea.
- **Filters**: http(s) only, LinkedIn rejected when Safe Mode is on, same-origin enforcement for sitemap imports (against the sitemap's host), and dedupe against the existing queue. The popup reports counts ("Added 34 pages (6 filtered, 3 duplicates)").
- **Capture type**: one selector (text + images / text only / images only) applies to the entire run.

## Safety & Rate Limiting
- **LinkedIn Safe Mode**: As LinkedIn proactively detects headless/bot movement, LinkedIn URLs are rejected at queue intake and skipped again at run time as a backstop. Only single, user-initiated tab capture is permitted.
- **Jittered pacing**: Queue runs wait a randomized 2.5–4.5s between pages (4–7s when the run started with more than 20 pages). Exact fixed intervals are a more robotic signature than jittered ones. Child sitemaps during import are fetched ~1s apart.
- **Progress badge**: The extension icon shows the remaining page count during a run so the popup can stay closed.
- **SPA Timing**: The extension deliberately injects a naive 2-second sleep after `status === 'complete'` so React/Vue applications have time to populate the shadow DOM.
- **Fail-safes**: If `Readability` fails to extract core elements, it falls back to raw document body extraction ensuring no data loss.
