import { saveAuth, getAuth, updateAccessToken, clearAuth } from "./storage.js";

const CLIENT_ID = "b902612eb0de4453ba86d57151e069e9";

// Scopes needed for your features:
const SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "playlist-read-private",
  "playlist-read-collaborative"
];

// Spotify endpoints
const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

// ---- PKCE helpers ----
function base64UrlEncode(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function randomString(len = 64) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let out = "";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}

async function sha256(str) {
  const data = new TextEncoder().encode(str);
  return crypto.subtle.digest("SHA-256", data);
}

function getRedirectUri() {
  // This must be added in Spotify Dashboard Redirect URIs
  return chrome.identity.getRedirectURL("spotify");
}

function parseQueryParams(url) {
  const u = new URL(url);
  const params = {};
  for (const [k, v] of u.searchParams.entries()) params[k] = v;
  return params;
}

// ---- OAuth flow ----
export async function login() {
  const redirectUri = getRedirectUri();

  const codeVerifier = randomString(64);
  const codeChallenge = base64UrlEncode(await sha256(codeVerifier));
  const state = randomString(16);

  // store verifier+state temporarily
  await chrome.storage.local.set({
    spotify_pkce: { codeVerifier, state }
  });

  const authParams = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    state,
    scope: SCOPES.join(" ")
  });

  const authFlowUrl = `${AUTH_URL}?${authParams.toString()}`;

  const redirectResponseUrl = await chrome.identity.launchWebAuthFlow({
    url: authFlowUrl,
    interactive: true
  });

  if (!redirectResponseUrl) throw new Error("Login cancelled.");

  const { code, error, state: returnedState } = parseQueryParams(redirectResponseUrl);
  if (error) throw new Error(error);

  const tmp = (await chrome.storage.local.get("spotify_pkce")).spotify_pkce;
  if (!tmp) throw new Error("Missing PKCE state.");
  if (returnedState !== tmp.state) throw new Error("State mismatch (possible CSRF).");

  // Exchange code for tokens
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: tmp.codeVerifier
    })
  });

  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error(tokenJson?.error_description || "Token exchange failed.");
  }

  if (!tokenJson.refresh_token) {
    // Spotify should return refresh_token for Authorization Code flow;
    // if not, user might have previously authorized without it.
    throw new Error("No refresh token returned. Try removing app access in Spotify and login again.");
  }

  await saveAuth(tokenJson);
  await chrome.storage.local.remove("spotify_pkce");
}

async function refreshAccessToken(refresh_token) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token
    })
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json?.error_description || "Token refresh failed.");

  await updateAccessToken(json.access_token, json.expires_in);
  return json.access_token;
}

export async function getValidAccessToken() {
  const auth = await getAuth();
  if (!auth) throw new Error("Not logged in.");

  // Add a small buffer so we refresh *before* it expires
  const bufferMs = 30_000;
  if (Date.now() < (auth.expires_at || 0) - bufferMs) {
    return auth.access_token;
  }

  if (!auth.refresh_token) {
    await clearAuth();
    throw new Error("Session expired. Please login again.");
  }

  return refreshAccessToken(auth.refresh_token);
}