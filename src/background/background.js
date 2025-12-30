import { Msg } from "../shared/messages.js";
import { login, getValidAccessToken } from "./spotifyAuth.js";
import { clearAuth } from "./storage.js";
import { SpotifyApi } from "./spotifyApi.js";

// Side panel behavior (guarded so it never crashes)
function enableSidePanelOnClick() {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
}
chrome.runtime.onInstalled.addListener(enableSidePanelOnClick);
chrome.runtime.onStartup.addListener(enableSidePanelOnClick);

async function togglePlayPause(token) {
  const player = await SpotifyApi.player(token);
  if (!player) throw new Error("No active playback. Start Spotify on a device first.");
  if (player.is_playing) await SpotifyApi.pause(token);
  else await SpotifyApi.play(token);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === Msg.LOGIN) {
        await login();
        return sendResponse({ ok: true });
      }

      if (msg.type === Msg.LOGOUT) {
        await clearAuth();
        return sendResponse({ ok: true });
      }

      const token = await getValidAccessToken();

      if (msg.type === Msg.ME) {
        const me = await SpotifyApi.me(token);
        return sendResponse({
          ok: true,
          data: {
            display_name: me.display_name,
            id: me.id,
            image: me.images?.[0]?.url || null
          }
        });
      }

      if (msg.type === Msg.NOW_PLAYING) {
        const player = await SpotifyApi.player(token);
        return sendResponse({ ok: true, data: player });
      }

      if (msg.type === Msg.TOGGLE) {
        await togglePlayPause(token);
        return sendResponse({ ok: true });
      }

      if (msg.type === Msg.NEXT) {
        await SpotifyApi.next(token);
        return sendResponse({ ok: true });
      }

      if (msg.type === Msg.PREV) {
        await SpotifyApi.prev(token);
        return sendResponse({ ok: true });
      }

      if (msg.type === Msg.VOLUME) {
        const v = Math.max(0, Math.min(100, Number(msg.volume)));
        await SpotifyApi.volume(token, v);
        return sendResponse({ ok: true });
      }

      if (msg.type === Msg.SEEK) {
        const pos = Math.max(0, Number(msg.positionMs) || 0);
        const deviceId = msg.deviceId || undefined;
        await SpotifyApi.seek(token, pos, deviceId);
        return sendResponse({ ok: true });
      }

      // Playlists list (includes id + image)
      if (msg.type === Msg.PLAYLISTS) {
        const pl = await SpotifyApi.playlists(token);
        return sendResponse({
          ok: true,
          data: (pl.items || []).map(p => ({
            id: p.id,
            name: p.name,
            uri: p.uri,
            image: p.images?.[0]?.url || null
          }))
        });
      }

      // Tracks for one playlist
      if (msg.type === Msg.PLAYLIST_TRACKS) {
        const data = await SpotifyApi.playlistTracks(token, msg.playlistId);

        const tracks = (data.items || [])
          .map((it, idx) => {
            const tr = it.track;
            if (!tr) return null;
            return {
              index: idx,
              name: tr.name,
              artists: tr.artists?.map(a => a.name).join(", ") || "",
              duration_ms: tr.duration_ms || 0,
              image: tr.album?.images?.[2]?.url || tr.album?.images?.[0]?.url || null
            };
          })
          .filter(Boolean);

        return sendResponse({ ok: true, data: { tracks } });
      }

      // Play a playlist starting at a track index
      if (msg.type === Msg.PLAY_TRACK_IN_PLAYLIST) {
        await SpotifyApi.playFromPlaylistOffset(
          token,
          msg.playlistUri,
          Number(msg.position) || 0
        );
        return sendResponse({ ok: true });
      }

      // (Optional) old behavior: play playlist from start/resume
      if (msg.type === Msg.PLAY_PLAYLIST) {
        await SpotifyApi.play(token, { context_uri: msg.uri });
        return sendResponse({ ok: true });
      }

      sendResponse({ ok: false, error: "Unknown message type" });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
  })();

  return true;
});