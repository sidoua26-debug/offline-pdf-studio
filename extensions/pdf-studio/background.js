// Opens (or focuses) the single studio tab. Works with zero permissions
// across Chrome/Edge service workers and Firefox event pages.
const studioUrl = chrome.runtime.getURL('studio.html');
let studioTabId = null;

chrome.action.onClicked.addListener(async () => {
  if (studioTabId !== null) {
    try {
      const existing = await chrome.tabs.get(studioTabId);
      if (existing?.id !== undefined) {
        await chrome.tabs.update(existing.id, { active: true });
        if (existing.windowId !== undefined) await chrome.windows.update(existing.windowId, { focused: true });
        return;
      }
    } catch {
      studioTabId = null;
    }
  }

  try {
    const [existing] = await chrome.tabs.query({ url: studioUrl });
    if (existing?.id !== undefined) {
      studioTabId = existing.id;
      await chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId !== undefined) await chrome.windows.update(existing.windowId, { focused: true });
      return;
    }
  } catch {
    // Fall through and open a new tab if lookup fails
  }

  const tab = await chrome.tabs.create({ url: studioUrl });
  studioTabId = tab.id ?? null;
});
