// 2026-11-23 넓히기(D 팔로우 버튼 · A 문서 목차 판) 화면 캡처 — 1440·390. 읽기만(누르지 않는다, 목차만 연다).
// 사용: node capture.mjs <서버 주소>   → shots/<화면>-<폭>.jpg
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire("C:/Users/PC/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/");
const { chromium } = require("playwright");
const BASE = process.argv[2];
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"), "shots");
const CREATOR = "/creators/00000000-0000-4000-b000-000000000001";
const browser = await chromium.launch();
const login = await browser.newContext();
const lp = await login.newPage();
await lp.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 120000 });
await lp.locator('input[autocomplete="username"]').fill("byeolbit_fan");
await lp.locator('input[autocomplete="current-password"]').fill("fankkuk-local-1234");
await Promise.all([lp.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60000 }), lp.locator('button[type="submit"]').click()]);
const state = await login.storageState(); await login.close();
// [이름, 주소, 화면 가운데로 올 요소]
const SCREENS = [
  ["creator-detail", CREATOR, "button[aria-label$='팔로우 중'], button[aria-label$='팔로우']"],
  ["creators", "/creators", "button[aria-label$='팔로우'], button[aria-label$='팔로우 중']"],
  ["fan-home", "/home", "button[aria-label$='팔로우 취소'], button[aria-label$='팔로우']"],
  ["me-following", "/me/following", "button[aria-label$='팔로우 취소']"],
  ["pricing-toc", "/pricing", null],
];
for (const w of [1440, 390]) {
  const ctx = await browser.newContext({ locale: "ko-KR", viewport: { width: w, height: 900 }, storageState: state });
  const page = await ctx.newPage();
  for (const [name, url, focus] of SCREENS) {
    await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 120000 });
    if (focus) {
      const el = page.locator(focus).filter({ visible: true }).first();
      if (await el.count()) await el.evaluate((e) => e.scrollIntoView({ block: "center", behavior: "instant" }));
    } else {
      const toc = page.getByRole("button", { name: "목차 열기" }).filter({ visible: true }).first();
      if (await toc.count()) { await toc.click(); await page.waitForTimeout(400); }
    }
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `${name}-${w}.jpg`), type: "jpeg", quality: 70 });
    console.log("캡처", name, w);
  }
  await ctx.close();
}
await browser.close();
