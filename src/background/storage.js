const KEY = "spotify_auth";

export async function saveAuth(auth) {
  // auth: { access_token, refresh_token, expires_in }
  const expiresAt = Date.now() + (Number(auth.expires_in) || 3600) * 1000;

  await chrome.storage.local.set({
    [KEY]: {
      access_token: auth.access_token,
      refresh_token: auth.refresh_token,
      expires_at: expiresAt
    }
  });
}

export async function getAuth() {
  const obj = await chrome.storage.local.get(KEY);
  return obj[KEY] || null;
}

export async function updateAccessToken(access_token, expires_in) {
  const cur = await getAuth();
  if (!cur) return;

  const expiresAt = Date.now() + (Number(expires_in) || 3600) * 1000;

  await chrome.storage.local.set({
    [KEY]: {
      ...cur,
      access_token,
      expires_at: expiresAt
    }
  });
}

export async function clearAuth() {
  await chrome.storage.local.remove(KEY);
}