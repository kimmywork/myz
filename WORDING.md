Here’s suggested wording you can paste into the Chrome Web Store “Privacy practices” page. Feel free to tweak, but this covers each required field and matches the current implementation:

## Single purpose description

“MyZ Annotator lets me highlight and annotate webpages, manage those notes locally, and optionally sync them to my own LogSeq graph.”

## activeTab justification

“When I click the toolbar button, the extension needs temporary access to the current tab so it can read my text selection and capture a screenshot of the visible area.”

## tabs justification

“Used to run chrome.tabs.captureVisibleTab for the screenshot feature and to reopen the page section I highlighted. No browsing history is collected.”

## host permissions justification

“<all_urls> is needed so the content script can display the floating toolbar wherever I highlight text. http://127.0.0.1/* and http://localhost/* are only used when I opt in to sync with my own LogSeq server running on my machine.”

## storage justification

“Highlights, notes, color choices, and LogSeq settings are stored in chrome.storage.local so they stay on my device and reappear when I revisit a page.”

## remote code justification

“All extension code ships in the package; it never executes remote scripts. The only network requests are to the user-configured LogSeq HTTP API when synchronization is enabled.”