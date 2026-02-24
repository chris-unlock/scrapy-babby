# scrapy babby - Design Document

## Architecture Overview
This extension relies purely on Chrome APIs to guarantee that all execution is local, deterministic, and user-initiated.

- **Background Worker (`background.js`)**: Acts as the central orchestrator. Uses `chrome.downloads` to create formatted folders locally. Handles the queue timer logic.
- **Content Scripts (`content.js`)**: Dynamically injected on user action. Prevents unused background CPU consumption. Scrapes DOM and uses vendored libraries (Readability, Turndown).
- **Communication**: Strict message passing between popup -> background -> content script. Responses pass back the fully extracted objects.

## Safety & Rate Limiting
- **LinkedIn Safe Mode**: As LinkedIn proactively detects headless/bot movement, the "queue" runner skips LinkedIn entirely if the toggle is checked. Only single, user-initiated tab capture is permitted.
- **SPA Timing**: The extension deliberately injects a naive 2-second sleep after `status === 'complete'` so React/Vue applications have time to populate the shadow DOM.
- **Fail-safes**: If `Readability` fails to extract core elements, it falls back to raw document body extraction ensuring no data loss.
