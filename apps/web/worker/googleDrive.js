const GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const MAX_GOOGLE_TOKEN_RESPONSE_BYTES = 64 * 1024;
const GOOGLE_TOKEN_TIMEOUT_MS = 15_000;

export const GOOGLE_DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const GOOGLE_DRIVE_CALLBACK_PATH = "/api/v1/integrations/google-drive/callback";

export class GoogleDriveIntegrationError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "GoogleDriveIntegrationError";
    this.status = status;
    this.code = code;
  }
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new GoogleDriveIntegrationError(503, "google_token_key_invalid", "Google Drive 토큰 암호화 키 형식이 올바르지 않습니다.");
  }
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  try {
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    throw new GoogleDriveIntegrationError(503, "google_token_key_invalid", "Google Drive 토큰 암호화 키 형식이 올바르지 않습니다.");
  }
}

function randomBytes(length, cryptoImpl = globalThis.crypto) {
  const bytes = new Uint8Array(length);
  cryptoImpl.getRandomValues(bytes);
  return bytes;
}

async function sha256Bytes(value, cryptoImpl = globalThis.crypto) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return new Uint8Array(await cryptoImpl.subtle.digest("SHA-256", bytes));
}

export function googleDriveRedirectUri(appOrigin) {
  let origin;
  try {
    const parsed = new URL(appOrigin);
    const localHttp = parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
    if ((parsed.protocol !== "https:" && !localHttp) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new Error("invalid app origin");
    }
    origin = parsed.origin;
  } catch {
    throw new GoogleDriveIntegrationError(503, "google_oauth_origin_invalid", "Google Drive 연결용 앱 주소가 올바르지 않습니다.");
  }
  return new URL(GOOGLE_DRIVE_CALLBACK_PATH, `${origin}/`).toString();
}

export function getGoogleDriveConfiguration(env = {}) {
  const clientId = typeof env.GOOGLE_OAUTH_CLIENT_ID === "string" ? env.GOOGLE_OAUTH_CLIENT_ID.trim() : "";
  const clientSecret = typeof env.GOOGLE_OAUTH_CLIENT_SECRET === "string" ? env.GOOGLE_OAUTH_CLIENT_SECRET.trim() : "";
  const tokenEncryptionKey = typeof env.GOOGLE_TOKEN_ENCRYPTION_KEY === "string" ? env.GOOGLE_TOKEN_ENCRYPTION_KEY.trim() : "";
  let redirectUri = null;
  try {
    redirectUri = googleDriveRedirectUri(env.APP_ORIGIN);
  } catch {
    // Status endpoints must report an unavailable integration instead of throwing.
  }
  let tokenEncryptionKeyValid = false;
  try {
    tokenEncryptionKeyValid = base64UrlToBytes(tokenEncryptionKey).byteLength === 32;
  } catch {
    // Status endpoints must not enable a connection with a malformed key.
  }
  return {
    configured: Boolean(clientId && clientSecret && tokenEncryptionKeyValid && redirectUri),
    clientId,
    clientSecret,
    tokenEncryptionKey,
    redirectUri,
  };
}

export function requireGoogleDriveConfiguration(env = {}) {
  const configuration = getGoogleDriveConfiguration(env);
  if (!configuration.configured) {
    throw new GoogleDriveIntegrationError(503, "google_drive_unconfigured", "Google Drive 연결 설정이 아직 준비되지 않았습니다.");
  }
  return configuration;
}

export async function createGoogleOAuthAttempt(cryptoImpl = globalThis.crypto) {
  const verifier = bytesToBase64Url(randomBytes(32, cryptoImpl));
  const state = bytesToBase64Url(randomBytes(32, cryptoImpl));
  return {
    verifier,
    challenge: bytesToBase64Url(await sha256Bytes(verifier, cryptoImpl)),
    state,
    stateHash: bytesToBase64Url(await sha256Bytes(state, cryptoImpl)),
  };
}

export function buildGoogleDriveAuthorizationUrl({ clientId, redirectUri, state, codeChallenge }) {
  if (!clientId || !redirectUri || !/^[A-Za-z0-9_-]{43}$/u.test(state) || !/^[A-Za-z0-9_-]{43}$/u.test(codeChallenge)) {
    throw new GoogleDriveIntegrationError(500, "google_oauth_request_invalid", "Google Drive 연결 요청을 만들지 못했습니다.");
  }
  const url = new URL(GOOGLE_AUTHORIZATION_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_DRIVE_FILE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    enable_granular_consent: "true",
  }).toString();
  return url.toString();
}

async function importTokenKey(encodedKey, cryptoImpl = globalThis.crypto) {
  const keyBytes = base64UrlToBytes(encodedKey);
  if (keyBytes.byteLength !== 32) {
    throw new GoogleDriveIntegrationError(503, "google_token_key_invalid", "Google Drive 토큰 암호화 키는 32바이트여야 합니다.");
  }
  return cryptoImpl.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptGoogleToken(token, encodedKey, cryptoImpl = globalThis.crypto) {
  if (typeof token !== "string" || token.length < 16 || token.length > 4096) {
    throw new GoogleDriveIntegrationError(502, "google_refresh_token_invalid", "Google Drive 장기 연결 토큰 형식이 올바르지 않습니다.");
  }
  const iv = randomBytes(12, cryptoImpl);
  const key = await importTokenKey(encodedKey, cryptoImpl);
  const ciphertext = await cryptoImpl.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode("studio-7321:google-drive:v1") },
    key,
    new TextEncoder().encode(token),
  );
  return { ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)), iv: bytesToBase64Url(iv), keyVersion: 1 };
}

export async function decryptGoogleToken({ ciphertext, iv }, encodedKey, cryptoImpl = globalThis.crypto) {
  const key = await importTokenKey(encodedKey, cryptoImpl);
  const ivBytes = base64UrlToBytes(iv);
  if (ivBytes.byteLength !== 12) {
    throw new GoogleDriveIntegrationError(500, "google_refresh_token_unreadable", "저장된 Google Drive 연결 정보를 읽지 못했습니다.");
  }
  try {
    const plaintext = await cryptoImpl.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes, additionalData: new TextEncoder().encode("studio-7321:google-drive:v1") },
      key,
      base64UrlToBytes(ciphertext),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new GoogleDriveIntegrationError(500, "google_refresh_token_unreadable", "저장된 Google Drive 연결 정보를 읽지 못했습니다.");
  }
}

async function readBoundedJson(response, maxBytes = MAX_GOOGLE_TOKEN_RESPONSE_BYTES) {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) {
    await response.body?.cancel?.("google response too large");
    throw new GoogleDriveIntegrationError(502, "google_oauth_response_too_large", "Google 인증 응답이 허용 크기를 넘었습니다.");
  }
  if (!response.body?.getReader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new GoogleDriveIntegrationError(502, "google_oauth_response_too_large", "Google 인증 응답이 허용 크기를 넘었습니다.");
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new GoogleDriveIntegrationError(502, "google_oauth_response_invalid", "Google 인증 응답을 해석하지 못했습니다.");
    }
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("google response too large");
        throw new GoogleDriveIntegrationError(502, "google_oauth_response_too_large", "Google 인증 응답이 허용 크기를 넘었습니다.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new GoogleDriveIntegrationError(502, "google_oauth_response_invalid", "Google 인증 응답을 해석하지 못했습니다.");
  }
}

export async function exchangeGoogleAuthorizationCode({
  code,
  verifier,
  clientId,
  clientSecret,
  redirectUri,
  fetchImpl = globalThis.fetch,
  timeoutMs = GOOGLE_TOKEN_TIMEOUT_MS,
}) {
  if (typeof code !== "string" || code.length < 8 || code.length > 4096 || !/^[A-Za-z0-9._~+\/-]+$/u.test(code)) {
    throw new GoogleDriveIntegrationError(400, "google_oauth_code_invalid", "Google Drive 연결 코드가 올바르지 않습니다.");
  }
  if (!/^[A-Za-z0-9_-]{43}$/u.test(verifier)) {
    throw new GoogleDriveIntegrationError(400, "google_oauth_verifier_invalid", "Google Drive 연결 검증값이 올바르지 않습니다.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("google oauth timeout"), timeoutMs);
  try {
    const response = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
    });
    const body = await readBoundedJson(response);
    if (!response.ok) {
      throw new GoogleDriveIntegrationError(502, "google_oauth_exchange_failed", "Google Drive 연결 토큰을 받지 못했습니다.");
    }
    const returnedScopes = new Set(String(body.scope ?? "").split(/\s+/u).filter(Boolean));
    if (returnedScopes.size !== 1 || !returnedScopes.has(GOOGLE_DRIVE_FILE_SCOPE)) {
      throw new GoogleDriveIntegrationError(502, "google_oauth_scope_mismatch", "Google Drive가 선택 파일 전용 권한과 다른 범위를 반환했습니다.");
    }
    if (typeof body.refresh_token !== "string" || body.refresh_token.length < 16 || body.refresh_token.length > 4096) {
      throw new GoogleDriveIntegrationError(502, "google_refresh_token_missing", "Google Drive 장기 연결 토큰이 반환되지 않았습니다.");
    }
    return { refreshToken: body.refresh_token, scope: GOOGLE_DRIVE_FILE_SCOPE };
  } catch (error) {
    if (error instanceof GoogleDriveIntegrationError) throw error;
    if (controller.signal.aborted) {
      throw new GoogleDriveIntegrationError(504, "google_oauth_timeout", "Google Drive 연결 응답 시간이 초과됐습니다.");
    }
    throw new GoogleDriveIntegrationError(502, "google_oauth_exchange_failed", "Google Drive 연결 토큰을 받지 못했습니다.");
  } finally {
    clearTimeout(timer);
  }
}

export async function googleOAuthStateHash(state, cryptoImpl = globalThis.crypto) {
  if (typeof state !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(state)) {
    throw new GoogleDriveIntegrationError(400, "google_oauth_state_invalid", "Google Drive 연결 상태값이 올바르지 않습니다.");
  }
  return bytesToBase64Url(await sha256Bytes(state, cryptoImpl));
}
