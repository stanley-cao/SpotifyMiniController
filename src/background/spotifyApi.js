const API = "https://api.spotify.com/v1";

async function apiFetch(token, path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (res.status === 204) return null;

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const bodyText = await res.text();

  let data = null;
  if (bodyText) {
    if (isJson) {
      try {
        data = JSON.parse(bodyText);
      } catch {
        data = bodyText;
      }
    } else {
      data = bodyText;
    }
  }

  if (!res.ok) {
    const msg =
      (typeof data === "object" && data?.error?.message) ||
      (typeof data === "string" && data.slice(0, 200)) ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

export const SpotifyApi = {
  me: (t) => apiFetch(t, "/me"),
  player: (t) => apiFetch(t, "/me/player"),

  play: (t, body) =>
    apiFetch(t, "/me/player/play", {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined
    }),

  pause: (t) => apiFetch(t, "/me/player/pause", { method: "PUT" }),
  next: (t) => apiFetch(t, "/me/player/next", { method: "POST" }),
  prev: (t) => apiFetch(t, "/me/player/previous", { method: "POST" }),

  volume: (t, v) =>
    apiFetch(t, `/me/player/volume?volume_percent=${encodeURIComponent(v)}`, {
      method: "PUT"
    }),

  seek: (t, positionMs, deviceId) => {
    const qs = new URLSearchParams({ position_ms: String(positionMs) });
    if (deviceId) qs.set("device_id", deviceId);
    return apiFetch(t, `/me/player/seek?${qs.toString()}`, { method: "PUT" });
  },

  playlists: (t) => apiFetch(t, "/me/playlists?limit=50"),

  playlistTracks: (t, playlistId) =>
    apiFetch(t, `/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100`),

  playFromPlaylistOffset: (t, playlistUri, position) =>
    apiFetch(t, "/me/player/play", {
      method: "PUT",
      body: JSON.stringify({
        context_uri: playlistUri,
        offset: { position }
      })
    })
};