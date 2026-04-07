/* =============================================
   Focus Firewall — Background Service Worker
   Single source of truth: chrome.storage.local
   Listens for storage changes and notifies tabs
   ============================================= */

// Listen for changes in chrome.storage and broadcast to any open dashboard tabs
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  // Notify all extension pages (dashboard) about the change
  chrome.runtime.sendMessage({
    type: 'STORAGE_CHANGED',
    changes: changes,
  }).catch(() => {/* no listeners, that's ok */});
});

// Handle messages from dashboard or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_ALL_DATA') {
    chrome.storage.local.get(null, (data) => {
      sendResponse(data);
    });
    return true; // async response
  }

  if (message.type === 'SET_DATA') {
    chrome.storage.local.set(message.data, () => {
      sendResponse({ success: true });
    });
    return true; // async response
  }
});
