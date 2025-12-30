export function renderShell(root) {
  root.innerHTML = `
    <header class="header">
      <div class="profile" id="profile" hidden>
        <img id="avatar" class="avatar" alt="" hidden />
        <div class="profileText">
          <div class="name" id="displayName"></div>
        </div>
        <button id="logoutBtn" class="ghost" title="Logout">
          ${iconLogout()}
        </button>
      </div>

      <div class="loginRow" id="loginRow">
        <div class="title">Spotify Mini Controller</div>
        <button id="loginBtn" class="primary">Login</button>
      </div>
    </header>

    <main class="card">
      <div class="nowPlaying">
        <div class="track" id="nowPlaying">Not connected</div>
        <div class="device" id="device"></div>
      </div>

      <div class="seekRow">
        <div class="time" id="curTime">0:00</div>
        <input id="seek" type="range" min="0" max="1000" value="0" />
        <div class="time" id="durTime">0:00</div>
      </div>

      <div class="controls">
        <button id="prevBtn" class="iconBtn" title="Previous">${iconPrev()}</button>

        <button id="playPauseBtn" class="bigBtn" title="Play/Pause">
          <span id="playPauseIcon">${iconPlay()}</span>
        </button>

        <button id="nextBtn" class="iconBtn" title="Next">${iconNext()}</button>
      </div>

      <div class="row">
        <div class="label">Volume</div>
        <div class="volumeWrap">
          <span class="volIcon" aria-hidden="true">${iconVolume()}</span>
          <input id="volume" type="range" min="0" max="100" value="50" />
        </div>
        <div class="value" id="volValue">50</div>
      </div>

      <div class="playlistBlock">
        <div class="playlistHeader">
          <div class="label">Playlists</div>
          <input id="playlistSearch" class="search" placeholder="Search playlists…" />
          <button id="browseAllBtn" class="ghost is-hidden">Browse all</button>
        </div>

        <div id="playlistSectionTitle" class="sectionTitle">Recent</div>
        <div id="playlistList" class="playlistList"></div>
        <div id="trackList" class="trackList is-hidden"></div>
      </div>

      <div class="status" id="status"></div>
    </main>
  `;
}

// function to set play/pause icon
export function setPlayPauseIcon(isPlaying) {
  const el = document.getElementById("playPauseIcon");
  if (!el) return;
  el.innerHTML = isPlaying ? iconPause() : iconPlay();
}

/** Icons (inline SVG) */
function iconPlay() {
  return `
    <svg class="icon icon--lg" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M7 5.5v13l12-6.5L7 5.5z"></path>
    </svg>
  `;
}
function iconPause() {
  return `
    <svg class="icon icon--lg" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M7 5h3v14H7V5zm7 0h3v14h-3V5z"></path>
    </svg>
  `;
}
function iconNext() {
  return `
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M6 18V6l9 6-9 6zm10-12h2v12h-2V6z"></path>
    </svg>
  `;
}
function iconPrev() {
  return `
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M18 18l-9-6 9-6v12zM6 6h2v12H6V6z"></path>
    </svg>
  `;
}
function iconVolume() {
  return `
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M11 5 6.5 9H3v6h3.5L11 19V5zm5.5 7a4.5 4.5 0 0 0-2.25-3.9v7.8A4.5 4.5 0 0 0 16.5 12z"></path>
    </svg>
  `;
}
function iconLogout() {
  return `
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M10 17v-2h4v-6h-4V7l-5 5 5 5zm9-12h-7v2h7v10h-7v2h7a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"></path>
    </svg>
  `;
}