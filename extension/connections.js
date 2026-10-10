// Connections: the apps Glance works with. Each one needs Chrome's permission
// for its site, plus its adapter script registered to run there.
// Shared by the side panel and the background service worker.

const CONNECTIONS = {
  netflix: {
    name: "Netflix",
    origins: ["https://www.netflix.com/*"],
    home: "https://www.netflix.com/browse",
    script: "adapters/netflix.js",
  },
};

async function isAdapterRegistered(id) {
  const scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  return scripts.length > 0;
}

async function registerAdapter(id) {
  if (await isAdapterRegistered(id)) return;
  const { origins, script } = CONNECTIONS[id];
  await chrome.scripting.registerContentScripts([{ id, matches: origins, js: [script] }]);
}

async function unregisterAdapter(id) {
  if (!(await isAdapterRegistered(id))) return;
  await chrome.scripting.unregisterContentScripts({ ids: [id] });
}

// Turn an app on. Call this straight from a click: Chrome only shows its
// permission prompt in response to something the user did.
async function connect(id) {
  const granted = await chrome.permissions.request({ origins: CONNECTIONS[id].origins });
  if (!granted) return false;
  const { connections = {} } = await chrome.storage.local.get("connections");
  await chrome.storage.local.set({ connections: { ...connections, [id]: true } });
  await registerAdapter(id);
  return true;
}

// Turn an app off: stop its adapter and give its site permission back.
async function disconnect(id) {
  const { connections = {} } = await chrome.storage.local.get("connections");
  await chrome.storage.local.set({ connections: { ...connections, [id]: false } });
  await chrome.storage.local.remove(`${id}.connectedAt`);
  await unregisterAdapter(id);
  await chrome.permissions.remove({ origins: CONNECTIONS[id].origins });
}

// Make the registered adapters match the apps that are on and still permitted.
async function syncAdapters() {
  const { connections = {} } = await chrome.storage.local.get("connections");
  for (const id of Object.keys(CONNECTIONS)) {
    const permitted = await chrome.permissions.contains({ origins: CONNECTIONS[id].origins });
    if (connections[id] && permitted) await registerAdapter(id);
    else await unregisterAdapter(id);
  }
}
