const GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const GOOGLE_DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const MAX_GOOGLE_TOKEN_RESPONSE_BYTES = 64 * 1024;
const MAX_GOOGLE_DRIVE_RESPONSE_BYTES = 256 * 1024;
const GOOGLE_TOKEN_TIMEOUT_MS = 15_000;
const GOOGLE_DRIVE_TIMEOUT_MS = 20_000;
const GOOGLE_DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const GOOGLE_DRIVE_PHYSICS_FOLDER_NAME = "STUDIO 7321 Physics";
const GOOGLE_DRIVE_ROOT_APP_PROPERTY = "physics-root";
const GOOGLE_DRIVE_PDF_APP_PROPERTY = "physics-original";

export const GOOGLE_DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const GOOGLE_DRIVE_CALLBACK_PATH = "/physics/library";
export const GOOGLE_DRIVE_MAX_PDF_BYTES = 512 * 1024 * 1024;

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

export async function encryptGoogleDriveUploadSessionUrl(sessionUrl, encodedKey, cryptoImpl = globalThis.crypto) {
  const validatedUrl = validateGoogleDriveResumableUploadUrl(sessionUrl);
  const iv = randomBytes(12, cryptoImpl);
  const key = await importTokenKey(encodedKey, cryptoImpl);
  const ciphertext = await cryptoImpl.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode("studio-7321:google-drive-upload:v1") },
    key,
    new TextEncoder().encode(validatedUrl),
  );
  return { ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)), iv: bytesToBase64Url(iv), keyVersion: 1 };
}

export async function decryptGoogleDriveUploadSessionUrl({ ciphertext, iv }, encodedKey, cryptoImpl = globalThis.crypto) {
  const key = await importTokenKey(encodedKey, cryptoImpl);
  const ivBytes = base64UrlToBytes(iv);
  if (ivBytes.byteLength !== 12) {
    throw new GoogleDriveIntegrationError(500, "google_drive_upload_session_unreadable", "저장된 Google Drive 업로드 정보를 읽지 못했습니다.");
  }
  try {
    const plaintext = await cryptoImpl.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes, additionalData: new TextEncoder().encode("studio-7321:google-drive-upload:v1") },
      key,
      base64UrlToBytes(ciphertext),
    );
    return validateGoogleDriveResumableUploadUrl(new TextDecoder().decode(plaintext));
  } catch (error) {
    if (error instanceof GoogleDriveIntegrationError) throw error;
    throw new GoogleDriveIntegrationError(500, "google_drive_upload_session_unreadable", "저장된 Google Drive 업로드 정보를 읽지 못했습니다.");
  }
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

function validateGoogleAccessToken(value) {
  if (typeof value !== "string" || value.length < 20 || value.length > 4096 || /[\u0000-\u0020]/u.test(value)) {
    throw new GoogleDriveIntegrationError(502, "google_access_token_invalid", "Google Drive 단기 연결 토큰 형식이 올바르지 않습니다.");
  }
  return value;
}

function validateGoogleDriveFileId(value, code = "google_drive_file_invalid") {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{10,200}$/u.test(value)) {
    throw new GoogleDriveIntegrationError(502, code, "Google Drive 파일 식별자가 올바르지 않습니다.");
  }
  return value;
}

function safeGoogleDriveWebViewLink(value) {
  if (value === undefined || value === null || value === "") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["drive.google.com", "docs.google.com"].includes(url.hostname)
      || url.username || url.password || url.href.length > 2048) {
      throw new Error("invalid drive link");
    }
    return url.toString();
  } catch {
    throw new GoogleDriveIntegrationError(502, "google_drive_link_invalid", "Google Drive가 안전하지 않은 파일 링크를 반환했습니다.");
  }
}

function validateGoogleDriveFileMetadata(value, { expectedMimeType = null } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GoogleDriveIntegrationError(502, "google_drive_metadata_invalid", "Google Drive 파일 정보를 해석하지 못했습니다.");
  }
  const id = validateGoogleDriveFileId(value.id);
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name || name.length > 240 || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw new GoogleDriveIntegrationError(502, "google_drive_metadata_invalid", "Google Drive 파일 이름이 올바르지 않습니다.");
  }
  const mimeType = typeof value.mimeType === "string" ? value.mimeType : "";
  if (expectedMimeType && mimeType !== expectedMimeType) {
    throw new GoogleDriveIntegrationError(502, "google_drive_mime_mismatch", "Google Drive 파일 형식이 요청과 다릅니다.");
  }
  const parents = Array.isArray(value.parents)
    ? value.parents.map((parent) => validateGoogleDriveFileId(parent, "google_drive_parent_invalid"))
    : [];
  const rawSize = value.size === undefined || value.size === null ? null : Number(value.size);
  if (rawSize !== null && (!Number.isSafeInteger(rawSize) || rawSize < 0 || rawSize > GOOGLE_DRIVE_MAX_PDF_BYTES)) {
    throw new GoogleDriveIntegrationError(502, "google_drive_size_invalid", "Google Drive 파일 크기가 허용 범위를 벗어났습니다.");
  }
  const md5Checksum = value.md5Checksum === undefined || value.md5Checksum === null
    ? null : String(value.md5Checksum).toLowerCase();
  if (md5Checksum !== null && !/^[a-f0-9]{32}$/u.test(md5Checksum)) {
    throw new GoogleDriveIntegrationError(502, "google_drive_checksum_invalid", "Google Drive 파일 체크섬이 올바르지 않습니다.");
  }
  const modifiedTime = value.modifiedTime === undefined || value.modifiedTime === null
    ? null : String(value.modifiedTime);
  if (modifiedTime !== null && !Number.isFinite(Date.parse(modifiedTime))) {
    throw new GoogleDriveIntegrationError(502, "google_drive_time_invalid", "Google Drive 파일 수정 시각이 올바르지 않습니다.");
  }
  const appProperties = value.appProperties && typeof value.appProperties === "object" && !Array.isArray(value.appProperties)
    ? value.appProperties : {};
  return {
    id,
    name,
    mimeType,
    parents,
    byteSize: rawSize,
    md5Checksum,
    modifiedTime,
    webViewLink: safeGoogleDriveWebViewLink(value.webViewLink),
    appProperties,
  };
}

async function authorizedGoogleJsonRequest(url, {
  accessToken,
  method = "GET",
  headers = {},
  body,
  fetchImpl = globalThis.fetch,
  timeoutMs = GOOGLE_DRIVE_TIMEOUT_MS,
  expectedMimeType = null,
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("google drive timeout"), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method,
      redirect: "error",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${validateGoogleAccessToken(accessToken)}`,
        ...headers,
      },
      body,
    });
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel?.("reauthorization required");
      throw new GoogleDriveIntegrationError(401, "google_drive_reauthorization_required", "Google Drive 연결을 다시 승인해야 합니다.");
    }
    if (!response.ok) {
      await response.body?.cancel?.("google drive request failed");
      throw new GoogleDriveIntegrationError(502, "google_drive_request_failed", "Google Drive 요청을 처리하지 못했습니다.");
    }
    const value = await readBoundedJson(response, MAX_GOOGLE_DRIVE_RESPONSE_BYTES);
    return expectedMimeType ? validateGoogleDriveFileMetadata(value, { expectedMimeType }) : value;
  } catch (error) {
    if (error instanceof GoogleDriveIntegrationError) throw error;
    if (controller.signal.aborted) {
      throw new GoogleDriveIntegrationError(504, "google_drive_timeout", "Google Drive 응답 시간이 초과됐습니다.");
    }
    throw new GoogleDriveIntegrationError(502, "google_drive_request_failed", "Google Drive 요청을 처리하지 못했습니다.");
  } finally {
    clearTimeout(timer);
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

export async function refreshGoogleAccessToken({
  refreshToken,
  clientId,
  clientSecret,
  fetchImpl = globalThis.fetch,
  timeoutMs = GOOGLE_TOKEN_TIMEOUT_MS,
}) {
  if (typeof refreshToken !== "string" || refreshToken.length < 16 || refreshToken.length > 4096) {
    throw new GoogleDriveIntegrationError(500, "google_refresh_token_unreadable", "저장된 Google Drive 연결 정보를 읽지 못했습니다.");
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
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const body = await readBoundedJson(response);
    if (!response.ok) {
      const authorizationError = ["invalid_grant", "invalid_client", "unauthorized_client"].includes(body?.error);
      throw new GoogleDriveIntegrationError(
        authorizationError ? 401 : 502,
        authorizationError ? "google_drive_reauthorization_required" : "google_oauth_refresh_failed",
        authorizationError ? "Google Drive 연결을 다시 승인해야 합니다." : "Google Drive 연결을 갱신하지 못했습니다.",
      );
    }
    if (body.scope !== undefined) {
      const returnedScopes = new Set(String(body.scope).split(/\s+/u).filter(Boolean));
      if (returnedScopes.size !== 1 || !returnedScopes.has(GOOGLE_DRIVE_FILE_SCOPE)) {
        throw new GoogleDriveIntegrationError(502, "google_oauth_scope_mismatch", "Google Drive가 선택 파일 전용 권한과 다른 범위를 반환했습니다.");
      }
    }
    if (body.token_type !== undefined && String(body.token_type).toLowerCase() !== "bearer") {
      throw new GoogleDriveIntegrationError(502, "google_access_token_invalid", "Google Drive 단기 연결 토큰 형식이 올바르지 않습니다.");
    }
    const expiresIn = Number(body.expires_in ?? 3600);
    if (!Number.isSafeInteger(expiresIn) || expiresIn < 60 || expiresIn > 86_400) {
      throw new GoogleDriveIntegrationError(502, "google_access_token_invalid", "Google Drive 단기 연결 토큰 만료 시간이 올바르지 않습니다.");
    }
    return { accessToken: validateGoogleAccessToken(body.access_token), expiresIn };
  } catch (error) {
    if (error instanceof GoogleDriveIntegrationError) throw error;
    if (controller.signal.aborted) {
      throw new GoogleDriveIntegrationError(504, "google_oauth_timeout", "Google Drive 연결 갱신 응답 시간이 초과됐습니다.");
    }
    throw new GoogleDriveIntegrationError(502, "google_oauth_refresh_failed", "Google Drive 연결을 갱신하지 못했습니다.");
  } finally {
    clearTimeout(timer);
  }
}

export async function findOrCreateGoogleDrivePhysicsFolder({
  accessToken,
  fetchImpl = globalThis.fetch,
}) {
  const query = [
    "trashed = false",
    `mimeType = '${GOOGLE_DRIVE_FOLDER_MIME_TYPE}'`,
    `appProperties has { key='studio7321Kind' and value='${GOOGLE_DRIVE_ROOT_APP_PROPERTY}' }`,
  ].join(" and ");
  const searchUrl = new URL(GOOGLE_DRIVE_FILES_URL);
  searchUrl.search = new URLSearchParams({
    q: query,
    spaces: "drive",
    pageSize: "10",
    orderBy: "createdTime",
    fields: "files(id,name,mimeType,parents,appProperties,webViewLink)",
  }).toString();
  const search = await authorizedGoogleJsonRequest(searchUrl, { accessToken, fetchImpl });
  if (!search || !Array.isArray(search.files)) {
    throw new GoogleDriveIntegrationError(502, "google_drive_metadata_invalid", "Google Drive 폴더 목록을 해석하지 못했습니다.");
  }
  if (search.files.length > 0) {
    const folder = validateGoogleDriveFileMetadata(search.files[0], { expectedMimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE });
    if (folder.appProperties.studio7321Kind !== GOOGLE_DRIVE_ROOT_APP_PROPERTY) {
      throw new GoogleDriveIntegrationError(502, "google_drive_folder_invalid", "STUDIO 7321 전용 Drive 폴더를 확인하지 못했습니다.");
    }
    return folder;
  }

  const createUrl = new URL(GOOGLE_DRIVE_FILES_URL);
  createUrl.searchParams.set("fields", "id,name,mimeType,parents,appProperties,webViewLink");
  const folder = await authorizedGoogleJsonRequest(createUrl, {
    accessToken,
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      name: GOOGLE_DRIVE_PHYSICS_FOLDER_NAME,
      mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
      appProperties: { studio7321Kind: GOOGLE_DRIVE_ROOT_APP_PROPERTY },
    }),
    fetchImpl,
    expectedMimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
  });
  if (folder.name !== GOOGLE_DRIVE_PHYSICS_FOLDER_NAME
    || folder.appProperties.studio7321Kind !== GOOGLE_DRIVE_ROOT_APP_PROPERTY) {
    throw new GoogleDriveIntegrationError(502, "google_drive_folder_invalid", "STUDIO 7321 전용 Drive 폴더를 만들지 못했습니다.");
  }
  return folder;
}

function validateGoogleDriveResumableUploadUrl(value) {
  try {
    const url = new URL(value);
    const keys = [...url.searchParams.keys()];
    const uploadId = url.searchParams.get("upload_id");
    if (url.protocol !== "https:" || url.hostname !== "www.googleapis.com"
      || url.pathname !== "/upload/drive/v3/files" || url.username || url.password
      || url.searchParams.get("uploadType") !== "resumable"
      || keys.some((key) => !["uploadType", "upload_id"].includes(key))
      || typeof uploadId !== "string" || uploadId.length < 10 || uploadId.length > 2048
      || /[\u0000-\u0020]/u.test(uploadId) || url.href.length > 4096) {
      throw new Error("invalid resumable upload URL");
    }
    return url.toString();
  } catch {
    throw new GoogleDriveIntegrationError(502, "google_drive_upload_session_invalid", "Google Drive 업로드 세션 주소가 올바르지 않습니다.");
  }
}

export async function initiateGoogleDrivePdfUpload({
  accessToken,
  folderId,
  uploadSessionId,
  name,
  byteSize,
  fetchImpl = globalThis.fetch,
  timeoutMs = GOOGLE_DRIVE_TIMEOUT_MS,
}) {
  validateGoogleDriveFileId(folderId, "google_drive_folder_invalid");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(uploadSessionId ?? "")) {
    throw new GoogleDriveIntegrationError(500, "google_drive_upload_session_invalid", "Google Drive 업로드 식별자가 올바르지 않습니다.");
  }
  if (typeof name !== "string" || !name.trim() || name.trim().length > 240 || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw new GoogleDriveIntegrationError(400, "google_drive_filename_invalid", "PDF 파일 이름이 올바르지 않습니다.");
  }
  if (!Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > GOOGLE_DRIVE_MAX_PDF_BYTES) {
    throw new GoogleDriveIntegrationError(413, "google_drive_file_too_large", "PDF 파일은 512MiB 이하여야 합니다.");
  }
  const uploadUrl = new URL(GOOGLE_DRIVE_UPLOAD_URL);
  uploadUrl.search = new URLSearchParams({
    uploadType: "resumable",
    fields: "id,name,mimeType,size,parents,md5Checksum,modifiedTime,webViewLink,appProperties",
  }).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("google drive timeout"), timeoutMs);
  try {
    const response = await fetchImpl(uploadUrl, {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${validateGoogleAccessToken(accessToken)}`,
        "content-type": "application/json; charset=utf-8",
        "x-upload-content-length": String(byteSize),
        "x-upload-content-type": "application/pdf",
      },
      body: JSON.stringify({
        name: name.trim(),
        mimeType: "application/pdf",
        parents: [folderId],
        appProperties: {
          studio7321Kind: GOOGLE_DRIVE_PDF_APP_PROPERTY,
          studio7321UploadSession: uploadSessionId,
        },
      }),
    });
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel?.("reauthorization required");
      throw new GoogleDriveIntegrationError(401, "google_drive_reauthorization_required", "Google Drive 연결을 다시 승인해야 합니다.");
    }
    if (!response.ok) {
      await response.body?.cancel?.("upload session failed");
      throw new GoogleDriveIntegrationError(502, "google_drive_upload_session_failed", "Google Drive 업로드 세션을 만들지 못했습니다.");
    }
    await response.body?.cancel?.("upload session headers accepted");
    return { sessionUrl: validateGoogleDriveResumableUploadUrl(response.headers.get("location")) };
  } catch (error) {
    if (error instanceof GoogleDriveIntegrationError) throw error;
    if (controller.signal.aborted) {
      throw new GoogleDriveIntegrationError(504, "google_drive_timeout", "Google Drive 응답 시간이 초과됐습니다.");
    }
    throw new GoogleDriveIntegrationError(502, "google_drive_upload_session_failed", "Google Drive 업로드 세션을 만들지 못했습니다.");
  } finally {
    clearTimeout(timer);
  }
}

export async function getGoogleDrivePdfMetadata({
  accessToken,
  fileId,
  fetchImpl = globalThis.fetch,
}) {
  const metadataUrl = new URL(`${GOOGLE_DRIVE_FILES_URL}/${encodeURIComponent(validateGoogleDriveFileId(fileId))}`);
  metadataUrl.searchParams.set("fields", "id,name,mimeType,size,parents,md5Checksum,modifiedTime,webViewLink,appProperties");
  return authorizedGoogleJsonRequest(metadataUrl, {
    accessToken,
    fetchImpl,
    expectedMimeType: "application/pdf",
  });
}

export async function googleOAuthStateHash(state, cryptoImpl = globalThis.crypto) {
  if (typeof state !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(state)) {
    throw new GoogleDriveIntegrationError(400, "google_oauth_state_invalid", "Google Drive 연결 상태값이 올바르지 않습니다.");
  }
  return bytesToBase64Url(await sha256Bytes(state, cryptoImpl));
}
