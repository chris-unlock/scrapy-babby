# Permissions Rationale

- `tabs` & `activeTab`: Required to see tab URLs and execute scripts on the tab currently visible to the user.
- `scripting`: Required in Manifest V3 to inject `content.js`, `readability.js`, and `turndown.js` on demand.
- `storage`: Required to securely store the local queue state between sessions in `chrome.storage.local`.
- `downloads`: The mechanism to trigger local OS saves without a prompt. Enables automatic subdirectory creation `scrapy-babby/...`
- `contextMenus`: Used strictly for the "Add Link to Queue" right-click action.
- `host_permissions: <all_urls>`: The user requires the ability to save *any* web page they visit. Narrowing this down would break functionality on unpredicted sites.
