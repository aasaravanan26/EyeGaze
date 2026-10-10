// Netflix adapter: runs inside netflix.com and performs actions on the page.

const actions = {
  playFirstResult() {
    const link = [...document.querySelectorAll("a[href]")].find((a) =>
      /\/(watch|title)\/\d+/.test(a.getAttribute("href"))
    );
    if (!link) {
      return { ok: false, message: "No search results found on this page." };
    }
    const id = link.getAttribute("href").match(/\/(?:watch|title)\/(\d+)/)[1];
    location.assign(`/watch/${id}`);
    return { ok: true, message: `Opening title ${id}…` };
  },

  togglePause() {
    const video = document.querySelector("video");
    if (!video) {
      return { ok: false, message: "Nothing is playing yet." };
    }
    if (video.paused) {
      video.play().catch(() => {});
      return { ok: true, message: "Playing." };
    }
    video.pause();
    return { ok: true, message: "Paused." };
  },
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const action = actions[message.action];
  sendResponse(action ? action() : { ok: false, message: `Unknown action: ${message.action}` });
});
