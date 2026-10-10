importScripts("connections.js");

// Clicking the Glance toolbar icon opens the side panel.
// Later, this is also where calls to the backend will live.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// Keep adapters in step with the apps that are on: after installing or
// updating Glance, when Chrome starts, and if someone removes a site's
// permission from Chrome's own settings.
chrome.runtime.onInstalled.addListener(syncAdapters);
chrome.runtime.onStartup.addListener(syncAdapters);
chrome.permissions.onRemoved.addListener(syncAdapters);
