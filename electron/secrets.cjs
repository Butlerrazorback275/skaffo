/**
 * OS-backed secret storage for the GitHub token.
 *
 * Why not SQLite
 * --------------
 * Skaffo's database holds projects and schemas — nothing sensitive. A GitHub
 * personal access token with `repo` scope grants write access to every one of
 * the user's private repositories, so it must never sit in plaintext next to
 * project data where a backup, a bug report or any other process could read it.
 *
 * `safeStorage` delegates to the platform keystore:
 *   Windows  DPAPI          (bound to the Windows user account)
 *   macOS    Keychain
 *   Linux    libsecret / kwallet, when a keyring is available
 *
 * The ciphertext is written to a 0600 file in userData. On a Linux box with no
 * keyring, `isEncryptionAvailable()` returns false; we then refuse to persist
 * at all rather than silently writing plaintext, and the UI falls back to
 * asking for the token each time.
 */
const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const FILE = () => path.join(app.getPath('userData'), 'credentials.bin');

/** @returns {boolean} true when the OS can actually encrypt for us. */
function available() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function readAll() {
  try {
    const raw = fs.readFileSync(FILE());
    const json = safeStorage.decryptString(raw);
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // Missing file, wrong OS user, rotated key — all mean "no secrets".
    return {};
  }
}

function writeAll(map) {
  const buf = safeStorage.encryptString(JSON.stringify(map));
  const target = FILE();
  const tmp = `${target}.tmp`;
  // 0600: owner read/write only. Written to a temp file and renamed so a
  // crash mid-write cannot leave a truncated blob behind.
  fs.writeFileSync(tmp, buf, { mode: 0o600 });
  fs.renameSync(tmp, target);
  try {
    fs.chmodSync(target, 0o600);
  } catch {
    /* best effort — Windows ignores the mode */
  }
}

/** Store one secret. Returns false when the OS keystore is unavailable. */
function setSecret(key, value) {
  if (!available()) return false;
  const all = readAll();
  if (value === null || value === undefined || value === '') delete all[key];
  else all[key] = String(value);
  writeAll(all);
  return true;
}

/** @returns {string|null} */
function getSecret(key) {
  if (!available()) return null;
  const v = readAll()[key];
  return typeof v === 'string' && v ? v : null;
}

function deleteSecret(key) {
  return setSecret(key, null);
}

/**
 * Metadata safe to show in the renderer — never the token itself.
 * The UI only ever needs to know "is one saved, and whose is it".
 */
function describe(key) {
  const token = getSecret(key);
  return {
    available: available(),
    saved: Boolean(token),
    hint: token ? `${token.slice(0, 4)}…${token.slice(-4)}` : null,
  };
}

module.exports = { available, setSecret, getSecret, deleteSecret, describe };
