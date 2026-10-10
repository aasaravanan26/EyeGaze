// Clicking the Glance toolbar icon opens the side panel.
// Later, this is also where calls to the backend will live.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));
