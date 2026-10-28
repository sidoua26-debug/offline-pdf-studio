// Opens (or focuses) the single studio tab statelessly.
// Works across Chrome/Edge service workers and Firefox event pages without
// storing mutable tab IDs in global state and without requiring tabs permissions.
const studioUrl = chrome.runtime.getURL('studio.html');

chrome.action.onClicked.addListener(async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'studio-ping' });
    if (response?.tabId !== undefined) {
      await chrome.tabs.update(response.tabId, { active: true });
      if (response.windowId !== undefined) {
        await chrome.windows.update(response.windowId, { focused: true });
      }
      return;
    }
  } catch {
    // Throws if no receiver exists (e.g., studio.html is not open).
    // In that case, fall through and create a new studio tab.
  }

  await chrome.tabs.create({ url: studioUrl });
});
