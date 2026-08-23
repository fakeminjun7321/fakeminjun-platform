import assert from "node:assert/strict";
import test from "node:test";
import {
  GOOGLE_DRIVE_CALLBACK_PATH,
  GOOGLE_DRIVE_FILE_SCOPE,
  buildGoogleDriveAuthorizationUrl,
  createGoogleOAuthAttempt,
  decryptGoogleDriveUploadSessionUrl,
  decryptGoogleToken,
  encryptGoogleDriveUploadSessionUrl,
  encryptGoogleToken,
  exchangeGoogleAuthorizationCode,
  findOrCreateGoogleDrivePhysicsFolder,
  getGoogleDrivePdfMetadata,
  getGoogleDriveConfiguration,
  googleDriveRedirectUri,
  googleOAuthStateHash,
  initiateGoogleDrivePdfUpload,
  refreshGoogleAccessToken,
  requireGoogleDriveConfiguration,
} from "../worker/googleDrive.js";

function key(byte) {
  return Buffer.alloc(32, byte).toString("base64url");
}

test("Drive OAuth is limited to the selected-file scope and fixed callback", async () => {
  const attempt = await createGoogleOAuthAttempt();
  assert.match(attempt.state, /^[A-Za-z0-9_-]{43}$/);
  assert.match(attempt.verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(attempt.stateHash, await googleOAuthStateHash(attempt.state));

  const redirectUri = googleDriveRedirectUri("https://app.example.test");
  assert.equal(redirectUri, `https://app.example.test${GOOGLE_DRIVE_CALLBACK_PATH}`);
  const authorization = new URL(buildGoogleDriveAuthorizationUrl({
    clientId: "client.apps.googleusercontent.com",
    redirectUri,
    state: attempt.state,
    codeChallenge: attempt.challenge,
  }));
  assert.equal(authorization.origin, "https://accounts.google.com");
  assert.equal(authorization.pathname, "/o/oauth2/v2/auth");
  assert.equal(authorization.searchParams.get("scope"), GOOGLE_DRIVE_FILE_SCOPE);
  assert.equal(authorization.searchParams.get("access_type"), "offline");
  assert.equal(authorization.searchParams.get("prompt"), "consent");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authorization.searchParams.has("include_granted_scopes"), false);
});

test("Drive OAuth configuration fails closed without every secret", () => {
  const partial = getGoogleDriveConfiguration({
    APP_ORIGIN: "https://app.example.test",
    GOOGLE_OAUTH_CLIENT_ID: "client",
  });
  assert.equal(partial.configured, false);
  assert.equal(getGoogleDriveConfiguration({
    APP_ORIGIN: "https://app.example.test",
    GOOGLE_OAUTH_CLIENT_ID: "client",
    GOOGLE_OAUTH_CLIENT_SECRET: "secret",
    GOOGLE_TOKEN_ENCRYPTION_KEY: "short",
  }).configured, false);
  assert.throws(
    () => requireGoogleDriveConfiguration({
      APP_ORIGIN: "https://app.example.test",
      GOOGLE_OAUTH_CLIENT_ID: "client",
      GOOGLE_OAUTH_CLIENT_SECRET: "secret",
      GOOGLE_TOKEN_ENCRYPTION_KEY: "short",
    }),
    (error) => error.code === "google_drive_unconfigured" && error.status === 503,
  );
  assert.throws(
    () => googleDriveRedirectUri("http://attacker.example"),
    (error) => error.code === "google_oauth_origin_invalid",
  );
});

test("Drive refresh tokens are AES-GCM encrypted and bound to the configured key", async () => {
  const token = "refresh-token-value-that-is-never-stored-in-plaintext";
  const encrypted = await encryptGoogleToken(token, key(7));
  assert.notEqual(encrypted.ciphertext, token);
  assert.equal(encrypted.keyVersion, 1);
  assert.equal(await decryptGoogleToken(encrypted, key(7)), token);
  await assert.rejects(
    () => decryptGoogleToken(encrypted, key(8)),
    (error) => error.code === "google_refresh_token_unreadable",
  );
});

test("Drive authorization-code exchange uses the fixed token endpoint and rejects broader scopes", async () => {
  const calls = [];
  const result = await exchangeGoogleAuthorizationCode({
    code: "valid-code-1234",
    verifier: "v".repeat(43),
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "https://app.example.test/physics/library",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({
        refresh_token: "refresh-token-value-1234567890",
        scope: GOOGLE_DRIVE_FILE_SCOPE,
      }), { headers: { "content-type": "application/json" } });
    },
  });
  assert.equal(result.scope, GOOGLE_DRIVE_FILE_SCOPE);
  assert.equal(calls[0].url, "https://oauth2.googleapis.com/token");
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].options.body.get("grant_type"), "authorization_code");
  assert.equal(calls[0].options.body.get("code_verifier"), "v".repeat(43));

  await assert.rejects(
    () => exchangeGoogleAuthorizationCode({
      code: "valid-code-1234",
      verifier: "v".repeat(43),
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "https://app.example.test/physics/library",
      fetchImpl: async () => new Response(JSON.stringify({
        refresh_token: "refresh-token-value-1234567890",
        scope: `${GOOGLE_DRIVE_FILE_SCOPE} https://www.googleapis.com/auth/drive.readonly`,
      })),
    }),
    (error) => error.code === "google_oauth_scope_mismatch",
  );

  await assert.rejects(
    () => exchangeGoogleAuthorizationCode({
      code: "valid-code-1234",
      verifier: "v".repeat(43),
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "https://app.example.test/physics/library",
      fetchImpl: async () => new Response("not-json"),
    }),
    (error) => error.code === "google_oauth_response_invalid",
  );

  await assert.rejects(
    () => exchangeGoogleAuthorizationCode({
      code: "valid-code-1234",
      verifier: "v".repeat(43),
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "https://app.example.test/physics/library",
      timeoutMs: 5,
      fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
    }),
    (error) => error.code === "google_oauth_timeout" && error.status === 504,
  );
});

test("Drive access refresh sends the stored refresh token only to Google's fixed token endpoint", async () => {
  const calls = [];
  const result = await refreshGoogleAccessToken({
    refreshToken: "refresh-token-value-1234567890",
    clientId: "client-id",
    clientSecret: "client-secret",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({
        access_token: "access-token-value-1234567890",
        expires_in: 3600,
        scope: GOOGLE_DRIVE_FILE_SCOPE,
        token_type: "Bearer",
      }));
    },
  });
  assert.equal(result.accessToken, "access-token-value-1234567890");
  assert.equal(calls[0].url, "https://oauth2.googleapis.com/token");
  assert.equal(calls[0].options.body.get("grant_type"), "refresh_token");
  assert.equal(calls[0].options.body.get("refresh_token"), "refresh-token-value-1234567890");

  await assert.rejects(
    () => refreshGoogleAccessToken({
      refreshToken: "refresh-token-value-1234567890",
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl: async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
    }),
    (error) => error.code === "google_drive_reauthorization_required" && error.status === 401,
  );
});

test("Drive physics folder is app-owned and created only when the fixed property is absent", async () => {
  const calls = [];
  const folder = await findOrCreateGoogleDrivePhysicsFolder({
    accessToken: "access-token-value-1234567890",
    fetchImpl: async (url, options) => {
      calls.push({ url: new URL(url), options });
      if (options.method === "POST") {
        return new Response(JSON.stringify({
          id: "folder-id-123456",
          name: "STUDIO 7321 Physics",
          mimeType: "application/vnd.google-apps.folder",
          appProperties: { studio7321Kind: "physics-root" },
          webViewLink: "https://drive.google.com/drive/folders/folder-id-123456",
        }));
      }
      return new Response(JSON.stringify({ files: [] }));
    },
  });
  assert.equal(folder.id, "folder-id-123456");
  assert.equal(calls.length, 2);
  assert.match(calls[0].url.searchParams.get("q"), /physics-root/u);
  assert.equal(calls[0].options.headers.authorization, "Bearer access-token-value-1234567890");
  const body = JSON.parse(calls[1].options.body);
  assert.equal(body.name, "STUDIO 7321 Physics");
  assert.deepEqual(body.appProperties, { studio7321Kind: "physics-root" });
});

test("Drive resumable PDF initiation pins metadata, folder, size, and returned Google endpoint", async () => {
  const calls = [];
  const upload = await initiateGoogleDrivePdfUpload({
    accessToken: "access-token-value-1234567890",
    folderId: "folder-id-123456",
    uploadSessionId: "9f165cbb-0315-4a0e-bf07-0c8c602e3da5",
    name: "Mechanics.pdf",
    byteSize: 400 * 1024 * 1024,
    fetchImpl: async (url, options) => {
      calls.push({ url: new URL(url), options });
      return new Response(null, {
        status: 200,
        headers: { location: "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=upload-session-123456" },
      });
    },
  });
  assert.match(upload.sessionUrl, /^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files/u);
  assert.equal(calls[0].url.searchParams.get("uploadType"), "resumable");
  assert.equal(calls[0].options.headers["x-upload-content-length"], String(400 * 1024 * 1024));
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    name: "Mechanics.pdf",
    mimeType: "application/pdf",
    parents: ["folder-id-123456"],
    appProperties: {
      studio7321Kind: "physics-original",
      studio7321UploadSession: "9f165cbb-0315-4a0e-bf07-0c8c602e3da5",
    },
  });

  await assert.rejects(
    () => initiateGoogleDrivePdfUpload({
      accessToken: "access-token-value-1234567890",
      folderId: "folder-id-123456",
      uploadSessionId: "9f165cbb-0315-4a0e-bf07-0c8c602e3da5",
      name: "Mechanics.pdf",
      byteSize: 100,
      fetchImpl: async () => new Response(null, { status: 200, headers: { location: "https://attacker.example/upload" } }),
    }),
    (error) => error.code === "google_drive_upload_session_invalid",
  );
});

test("Drive completion metadata is validated and upload-session URLs use separate encryption context", async () => {
  const metadata = await getGoogleDrivePdfMetadata({
    accessToken: "access-token-value-1234567890",
    fileId: "drive-file-123456",
    fetchImpl: async (url, options) => {
      const parsed = new URL(url);
      assert.equal(parsed.pathname, "/drive/v3/files/drive-file-123456");
      assert.equal(options.headers.authorization, "Bearer access-token-value-1234567890");
      return new Response(JSON.stringify({
        id: "drive-file-123456",
        name: "Mechanics.pdf",
        mimeType: "application/pdf",
        size: "4096",
        parents: ["folder-id-123456"],
        md5Checksum: "a".repeat(32),
        modifiedTime: "2026-08-23T02:00:00.000Z",
        webViewLink: "https://drive.google.com/file/d/drive-file-123456/view",
        appProperties: {
          studio7321Kind: "physics-original",
          studio7321UploadSession: "9f165cbb-0315-4a0e-bf07-0c8c602e3da5",
        },
      }));
    },
  });
  assert.equal(metadata.byteSize, 4096);
  assert.equal(metadata.appProperties.studio7321Kind, "physics-original");
  assert.equal(metadata.appProperties.studio7321UploadSession, "9f165cbb-0315-4a0e-bf07-0c8c602e3da5");

  const sessionUrl = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=upload-session-123456";
  const encrypted = await encryptGoogleDriveUploadSessionUrl(sessionUrl, key(12));
  assert.equal(await decryptGoogleDriveUploadSessionUrl(encrypted, key(12)), sessionUrl);
  await assert.rejects(
    () => decryptGoogleToken(encrypted, key(12)),
    (error) => error.code === "google_refresh_token_unreadable",
  );
});
