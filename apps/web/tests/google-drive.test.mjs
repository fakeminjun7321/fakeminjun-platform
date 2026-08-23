import assert from "node:assert/strict";
import test from "node:test";
import {
  GOOGLE_DRIVE_CALLBACK_PATH,
  GOOGLE_DRIVE_FILE_SCOPE,
  buildGoogleDriveAuthorizationUrl,
  createGoogleOAuthAttempt,
  decryptGoogleToken,
  encryptGoogleToken,
  exchangeGoogleAuthorizationCode,
  getGoogleDriveConfiguration,
  googleDriveRedirectUri,
  googleOAuthStateHash,
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
    redirectUri: "https://app.example.test/api/v1/integrations/google-drive/callback",
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
      redirectUri: "https://app.example.test/api/v1/integrations/google-drive/callback",
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
      redirectUri: "https://app.example.test/api/v1/integrations/google-drive/callback",
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
      redirectUri: "https://app.example.test/api/v1/integrations/google-drive/callback",
      timeoutMs: 5,
      fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
    }),
    (error) => error.code === "google_oauth_timeout" && error.status === 504,
  );
});
