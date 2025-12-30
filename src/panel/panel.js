import { Msg } from "../shared/messages.js";
import { renderShell, setPlayPauseIcon } from "./ui.js";

const root = document.getElementById("app");
renderShell(root);

const $ = (id) => document.getElementById(id);

// -------------------- DOM --------------------
// Auth/header
const loginRow = $("loginRow");
const loginBtn = $("loginBtn");
const profile = $("profile");
const logoutBtn = $("logoutBtn");

const avatar = $("avatar");
const displayName = $("displayName");
const userId = $("userId");

// Status + now playing
const nowPlayingEl = $("nowPlaying");
const deviceEl = $("device");
const statusEl = $("status");

// Seek/progress
const seek = $("seek");
const curTime = $("curTime");
const durTime = $("durTime");
let isSeeking = false;
let lastPlayer = null;

// Controls
const prevBtn = $("prevBtn");
const playPauseBtn = $("playPauseBtn");
const nextBtn = $("nextBtn");

// Volume
const volume = $("volume");
const volValue = $("volValue");
let volTimer = null;

// Playlists UX
const playlistSearch = $("playlistSearch");
const playlistList = $("playlistList");
const trackList = $("trackList");
const browseAllBtn = $("browseAllBtn");
const playlistSectionTitle = $("playlistSectionTitle");

// -------------------- State --------------------
let allPlaylists = []; // [{id,name,uri,image}]
let showAllBrowse = false;

const PREFS_KEY = "prefs";
const RECENTS_LIMIT = 3;

// -------------------- Helpers --------------------
function send(type, payload = {}) {
  return new Promise((resolve) =>
    chrome.runtime.sendMessage({ type, ...payload }, resolve)
  );
}

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg || "";
}

function fmt(ms) {
  const s = Math.floor((ms || 0) / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function formatNowPlaying(player) {
  if (!player) return { title: "No active playback", device: "" };
  const item = player.item;
  const name = item?.name || "Unknown";
  const artist = item?.artists?.map((a) => a.name).join(", ") || "";
  const device = player.device?.name ? `Device: ${player.device.name}` : "";
  return { title: `${name}${artist ? " — " + artist : ""}`, device };
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function imgTag(url) {
  return url ? `src="${url}"` : "";
}

// -------------------- Recents storage --------------------
async function getPrefs() {
  const obj = await chrome.storage.local.get(PREFS_KEY);
  return obj[PREFS_KEY] || { recents: [] };
}

async function setPrefs(prefs) {
  await chrome.storage.local.set({ [PREFS_KEY]: prefs });
}

async function addRecentPlaylist(id) {
  const prefs = await getPrefs();
  prefs.recents = [id, ...prefs.recents.filter((x) => x !== id)].slice(0, 20);
  await setPrefs(prefs);
}

function findPlaylistsByIds(ids) {
  const map = new Map(allPlaylists.map((p) => [p.id, p]));
  return ids.map((id) => map.get(id)).filter(Boolean);
}

// -------------------- Auth UI --------------------
function setLoggedInUI(me) {
  loginRow?.classList.add("is-hidden");
  loginBtn?.classList.add("is-hidden");

  profile?.classList.remove("is-hidden");
  if (profile) profile.hidden = false;

  if (displayName) displayName.textContent = me.display_name || "Spotify User";
  if (userId) userId.textContent = me.id ? `@${me.id}` : "";

  if (avatar) {
    if (me.image) {
      avatar.src = me.image;
      avatar.hidden = false;
    } else {
      avatar.hidden = true;
    }
  }
}

function setLoggedOutUI() {
  loginRow?.classList.remove("is-hidden");
  loginBtn?.classList.remove("is-hidden");

  profile?.classList.add("is-hidden");
  if (profile) profile.hidden = true;

  if (nowPlayingEl) nowPlayingEl.textContent = "Not connected";
  if (deviceEl) deviceEl.textContent = "";
  setPlayPauseIcon(false);

  if (curTime) curTime.textContent = "0:00";
  if (durTime) durTime.textContent = "0:00";
  if (seek) seek.value = "0";

  // reset playlists view
  trackList?.classList.add("is-hidden");
  playlistList?.classList.remove("is-hidden");
  if (playlistSearch) playlistSearch.value = "";
  showAllBrowse = false;
}

// -------------------- API refresh --------------------
async function refreshMe() {
  const res = await send(Msg.ME);
  return res.ok ? res.data : null;
}

async function refreshNowPlaying() {
  const res = await send(Msg.NOW_PLAYING);
  if (!res.ok) {
    setStatus(res.error);
    return;
  }

  const player = res.data;
  lastPlayer = player;

  setPlayPauseIcon(Boolean(player?.is_playing));

  const { title, device } = formatNowPlaying(player);
  if (nowPlayingEl) nowPlayingEl.textContent = title;
  if (deviceEl) deviceEl.textContent = device;

  const vol = player?.device?.volume_percent;
  if (typeof vol === "number" && volume) {
    volume.value = String(vol);
    if (volValue) volValue.textContent = String(vol);
  }

  const progress = player?.progress_ms ?? 0;
  const duration = player?.item?.duration_ms ?? 0;

  if (curTime) curTime.textContent = fmt(progress);
  if (durTime) durTime.textContent = fmt(duration);

  if (seek && !isSeeking) {
    const sliderVal = duration ? Math.floor((progress / duration) * 1000) : 0;
    seek.value = String(sliderVal);
  }

  setStatus("");
}

// -------------------- Playlists UI --------------------
function renderPlaylists(list) {
  if (!playlistList) return;

  playlistList.innerHTML = "";

  if (!list.length) {
    playlistList.innerHTML = `<div class="rowSub">No recent playlists yet. Search or browse all.</div>`;
    return;
  }

  for (const p of list) {
    const el = document.createElement("div");
    el.className = "rowItem";
    el.innerHTML = `
      <img class="thumb" ${imgTag(p.image)} alt="" />
      <div class="rowText">
        <div class="rowTitle">${escapeHtml(p.name)}</div>
        <div class="rowSub">Playlist</div>
      </div>
      <div class="chev">›</div>
    `;

    el.addEventListener("click", async () => openPlaylist(p));
    playlistList.appendChild(el);
  }
}

async function renderPlaylistHome() {
  if (!playlistList) return;

  const q = (playlistSearch?.value || "").trim().toLowerCase();

  // Search mode (always show all matches)
  if (q) {
    if (playlistSectionTitle) playlistSectionTitle.textContent = "Results";
    browseAllBtn?.classList.add("is-hidden");
    const filtered = allPlaylists.filter((p) =>
      p.name.toLowerCase().includes(q)
    );
    renderPlaylists(filtered);
    return;
  }

  // Default mode: Recent 3 OR Browse all
  const prefs = await getPrefs();
  const recents = findPlaylistsByIds(prefs.recents);

  if (!showAllBrowse) {
    if (playlistSectionTitle) playlistSectionTitle.textContent = "Recent";
    browseAllBtn?.classList.toggle(
      "is-hidden",
      allPlaylists.length <= RECENTS_LIMIT
    );
    if (browseAllBtn) browseAllBtn.textContent = "Browse all";
    renderPlaylists(recents.slice(0, RECENTS_LIMIT));
  } else {
    if (playlistSectionTitle) playlistSectionTitle.textContent = "All playlists";
    browseAllBtn?.classList.remove("is-hidden");
    if (browseAllBtn) browseAllBtn.textContent = "Show recent";
    renderPlaylists(allPlaylists);
  }
}

async function loadPlaylists() {
  const res = await send(Msg.PLAYLISTS);
  if (!res.ok) return;

  allPlaylists = res.data || [];
  await renderPlaylistHome();
}

async function openPlaylist(p) {
  if (!playlistList || !trackList) return;

  setStatus(`Loading "${p.name}"…`);

  await addRecentPlaylist(p.id);

  // Switch view
  playlistList.classList.add("is-hidden");
  trackList.classList.remove("is-hidden");

  const res = await send(Msg.PLAYLIST_TRACKS, {
    playlistId: p.id,
    playlistUri: p.uri
  });

  if (!res.ok) {
    setStatus(res.error);
    trackList.classList.add("is-hidden");
    playlistList.classList.remove("is-hidden");
    return;
  }

  renderTracks(p.name, res.data?.tracks || [], p.uri);
  setStatus("");
}

function renderTracks(playlistName, tracks, playlistUri) {
  if (!trackList) return;

  trackList.innerHTML = `
    <div class="trackTopBar">
      <button class="backBtn" id="backToPlaylists">← Back</button>
      <div class="rowTitle" style="flex:1; text-align:right;">${escapeHtml(
        playlistName
      )}</div>
    </div>
  `;

  $("backToPlaylists")?.addEventListener("click", async () => {
    trackList.classList.add("is-hidden");
    playlistList?.classList.remove("is-hidden");

    // when returning, show recents again and clear search
    if (playlistSearch) playlistSearch.value = "";
    showAllBrowse = false;
    await renderPlaylistHome();

    setStatus("");
  });

  if (!tracks.length) {
    const empty = document.createElement("div");
    empty.className = "rowSub";
    empty.textContent = "No tracks found in this playlist.";
    trackList.appendChild(empty);
    return;
  }

  for (const t of tracks) {
    const el = document.createElement("div");
    el.className = "rowItem";
    el.innerHTML = `
      <img class="thumb" ${imgTag(t.image)} alt="" />
      <div class="rowText">
        <div class="rowTitle">${escapeHtml(t.name)}</div>
        <div class="rowSub">${escapeHtml(t.artists)}</div>
      </div>
      <div class="chev">▶</div>
    `;

    el.addEventListener("click", async () => {
      setStatus("Starting track…");
      const playRes = await send(Msg.PLAY_TRACK_IN_PLAYLIST, {
        playlistUri,
        position: t.index
      });
      setStatus(playRes.ok ? "" : playRes.error);
      await refreshNowPlaying();
    });

    trackList.appendChild(el);
  }
}

// -------------------- Events --------------------
// Login
loginBtn?.addEventListener("click", async () => {
  setStatus("Logging in…");
  const res = await send(Msg.LOGIN);
  if (!res.ok) return setStatus(res.error);

  const me = await refreshMe();
  if (me) setLoggedInUI(me);

  setStatus("");
  await refreshNowPlaying();
  await loadPlaylists();
});

// Logout
logoutBtn?.addEventListener("click", async () => {
  const res = await send(Msg.LOGOUT);
  if (!res.ok) return setStatus(res.error);
  setLoggedOutUI();
  setStatus("Logged out.");
});

// Transport
playPauseBtn?.addEventListener("click", async () => {
  const res = await send(Msg.TOGGLE);
  setStatus(res.ok ? "" : res.error);
  await refreshNowPlaying();
});

nextBtn?.addEventListener("click", async () => {
  const res = await send(Msg.NEXT);
  setStatus(res.ok ? "" : res.error);
  await refreshNowPlaying();
});

prevBtn?.addEventListener("click", async () => {
  const res = await send(Msg.PREV);
  setStatus(res.ok ? "" : res.error);
  await refreshNowPlaying();
});

// Volume
volume?.addEventListener("input", () => {
  if (volValue) volValue.textContent = volume.value;
  clearTimeout(volTimer);
  volTimer = setTimeout(async () => {
    const res = await send(Msg.VOLUME, { volume: volume.value });
    if (!res.ok) setStatus(res.error);
  }, 150);
});

// Seek
seek?.addEventListener("pointerdown", () => {
  isSeeking = true;
});

seek?.addEventListener("pointerup", async () => {
  // Keep locked until seek completes + short delay so polling doesn't snap it back
  isSeeking = true;

  const duration = lastPlayer?.item?.duration_ms ?? 0;
  const deviceId = lastPlayer?.device?.id;
  if (!duration) {
    isSeeking = false;
    return;
  }

  const ratio = Number(seek.value) / 1000;
  const positionMs = Math.floor(duration * ratio);

  const res = await send(Msg.SEEK, { positionMs, deviceId });
  if (!res.ok) {
    setStatus(res.error);
    isSeeking = false;
    return;
  }

  await new Promise((r) => setTimeout(r, 400));
  isSeeking = false;

  await refreshNowPlaying();
});

// Fallback (e.g. keyboard drag)
seek?.addEventListener("change", async () => {
  if (isSeeking) return;

  const duration = lastPlayer?.item?.duration_ms ?? 0;
  const deviceId = lastPlayer?.device?.id;
  if (!duration) return;

  const ratio = Number(seek.value) / 1000;
  const positionMs = Math.floor(duration * ratio);

  const res = await send(Msg.SEEK, { positionMs, deviceId });
  if (!res.ok) setStatus(res.error);
});

// Playlist search + browse
playlistSearch?.addEventListener("input", async () => {
  showAllBrowse = false;
  await renderPlaylistHome();
});

browseAllBtn?.addEventListener("click", async () => {
  showAllBrowse = !showAllBrowse;
  await renderPlaylistHome();
});

// -------------------- Startup --------------------
(async () => {
  const me = await refreshMe();
  if (me) setLoggedInUI(me);
  else setLoggedOutUI();

  await refreshNowPlaying();
  await loadPlaylists();

  setInterval(refreshNowPlaying, 1000);
})();