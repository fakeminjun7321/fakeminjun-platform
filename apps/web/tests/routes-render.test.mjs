import assert from "node:assert/strict";
import { after, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

globalThis.window = {
  location: { pathname: "/politics/desk" },
  history: {},
  addEventListener() {},
  removeEventListener() {},
  clearTimeout,
  requestAnimationFrame(callback) { callback(); },
  matchMedia() {
    return { matches: false, addEventListener() {}, removeEventListener() {} };
  },
};

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});
const { App } = await vite.ssrLoadModule("/src/App.jsx");

after(async () => {
  await vite.close();
  delete globalThis.window;
});

const ROUTE_EXPECTATIONS = [
  ["/politics/desk", "정치 데스크"],
  ["/politics/institutions", "제도 이해"],
  ["/physics/learn", "물리 학습 허브"],
  ["/physics/library", "물리 자료 보관소"],
  ["/physics/find", "물리 자료 찾기"],
  ["/physics/ipho", "KPhO · IPhO 준비"],
];

for (const [pathname, expectedText] of ROUTE_EXPECTATIONS) {
  test(`renders the frontend contract for ${pathname}`, () => {
    window.location.pathname = pathname;
    const html = renderToStaticMarkup(React.createElement(App));
    assert.ok(html.includes(expectedText));
    assert.ok(html.includes("NON-LIVE DEMO"));
  });
}
