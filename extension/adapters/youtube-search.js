// YouTube search without opening a tab. The extension downloads the results
// page and reads the data YouTube embeds in it (ytInitialData), instead of
// rendering the page. Runs in the side panel, which has YouTube permission.

async function searchYouTube(query) {
  const response = await fetch(CONNECTIONS.youtube.searchUrl(query), { credentials: "include" });
  const html = await response.text();

  const marker = "var ytInitialData = ";
  const start = html.indexOf(marker);
  if (start === -1) return [];
  const jsonStart = start + marker.length;
  const data = JSON.parse(html.slice(jsonStart, html.indexOf(";</script>", jsonStart)));

  // Videos appear as "videoRenderer" entries, in page order. Ads, Shorts and
  // playlists use other entry types, so they're skipped.
  const items = [];
  (function walk(node) {
    if (items.length === 9 || !node || typeof node !== "object") return;
    const video = node.videoRenderer;
    if (video?.videoId) {
      const title = video.title?.runs?.map((run) => run.text).join("") ?? video.title?.simpleText;
      if (title && !items.some((item) => item.id === video.videoId)) {
        items.push({ id: video.videoId, title, image: `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg` });
      }
      return;
    }
    for (const value of Object.values(node)) walk(value);
  })(data);
  return items;
}
