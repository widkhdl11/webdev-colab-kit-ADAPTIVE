// 스킬 실험 세 화면 캡처 (1440·390, 전체 높이). 읽기만 한다.
// 사용: node capture.mjs <서버 주소> <접두어 before|after>
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire("C:/Users/PC/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/");
const { chromium } = require("playwright");

const BASE = process.argv[2];
const TAG = process.argv[3];
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");
fs.mkdirSync(OUT, { recursive: true });
const PAGES = [
  ["creator", "/creators/00000000-0000-4000-b000-000000000001"],
  ["gift-new", "/gifts/new"],
  ["home", "/home"],
];
const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: "ko-KR", viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 120000 });
await page.locator('input[autocomplete="username"]').fill("byeolbit_fan");
await page.locator('input[autocomplete="current-password"]').fill("fankkuk-local-1234");
await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60000 }), page.locator('button[type="submit"]').click()]);
for (const [name, url] of PAGES) {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    const resp = await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 120000 });
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
    await page.waitForTimeout(700);
    const m = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, fonts: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family).filter((v, i, a) => a.indexOf(v) === i) }));
    const file = path.join(OUT, `${TAG}-${name}-${w}.jpg`);
    await page.screenshot({ path: file, fullPage: true, type: "jpeg", quality: 72 });
    console.log(TAG, name, w, resp?.status(), new URL(page.url()).pathname, JSON.stringify(m));
  }
}
await browser.close();
