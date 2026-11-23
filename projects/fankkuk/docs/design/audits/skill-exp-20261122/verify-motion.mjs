// 캡처로 안 보이는 변경(등장·누름·움직임 줄이기)을 계산된 스타일로 확인한다. 읽기만.
// 사용: node verify-motion.mjs <서버 주소>
import { createRequire } from "node:module";
const require = createRequire("C:/Users/PC/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/");
const { chromium } = require("playwright");
const BASE = process.argv[2];
const CREATOR = "/creators/00000000-0000-4000-b000-000000000001";

const out = [];
const log = (k, v) => { out.push(`${k}: ${v}`); };
const browser = await chromium.launch();
for (const reduce of [false, true]) {
  const tag = reduce ? "[움직임 줄이기]" : "[기본]";
  const ctx = await browser.newContext({ locale: "ko-KR", viewport: { width: 1440, height: 900 }, reducedMotion: reduce ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 120000 });
  await page.locator('input[autocomplete="username"]').fill("byeolbit_fan");
  await page.locator('input[autocomplete="current-password"]').fill("fankkuk-local-1234");
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60000 }), page.locator('button[type="submit"]').click()]);

  // 크리에이터 상세
  await page.goto(BASE + CREATOR, { waitUntil: "networkidle", timeout: 120000 });
  if (!reduce) {
    const gap = await page.evaluate(() => {
      const ph = document.querySelector("[class*='photo']"); const nm = document.querySelector("h1");
      return Math.round(nm.getBoundingClientRect().left - ph.getBoundingClientRect().right);
    });
    log(`${tag} 상세 사진 오른쪽 ↔ 이름 왼쪽 간격(px)`, gap);
  }
  const toggle = page.locator("button[aria-controls]", { hasText: "상세 정보" });
  await toggle.click();
  log(`${tag} 상세 펼친 내용 animation-name`, await page.evaluate(() => getComputedStyle(document.querySelector("[class*='dbody']")).animationName));
  const tbox = await toggle.boundingBox();
  await page.mouse.move(tbox.x + tbox.width / 2, tbox.y + tbox.height / 2); await page.mouse.down(); await page.waitForTimeout(200);
  log(`${tag} 여닫기 버튼 누른 동안 transform`, await toggle.evaluate((el) => getComputedStyle(el).transform));
  await page.mouse.up();
  log(`${tag} 꺾쇠 transition`, await page.evaluate(() => getComputedStyle(document.querySelector("[class*='dchev']")).transition));

  // 선물 보내기
  await page.goto(BASE + "/gifts/new", { waitUntil: "networkidle", timeout: 120000 });
  log(`${tag} 선물 보내기 처음 열 때 data-stepped / 1단계 animation-name`, await page.evaluate(() => `${document.querySelector("[data-stepped]") ? "있음" : "없음"} / ${getComputedStyle(document.querySelector("form fieldset:not([hidden])")).animationName}`));
  const pick = page.locator("form fieldset:not([hidden]) li label").first();
  const pbox = await pick.boundingBox();
  await page.mouse.move(pbox.x + pbox.width / 2, pbox.y + pbox.height / 2); await page.mouse.down(); await page.waitForTimeout(200);
  log(`${tag} 고르는 칸 누른 동안 transform`, await pick.evaluate((el) => getComputedStyle(el).transform));
  await page.mouse.up(); await page.waitForTimeout(400);
  log(`${tag} 고른 칸 체크 transform`, await pick.evaluate((el) => getComputedStyle(el.querySelector("svg:last-of-type") ?? el).transform));
  await page.getByRole("button", { name: "다음" }).click(); await page.waitForTimeout(60);
  log(`${tag} 2단계로 넘긴 직후 data-stepped / 2단계 animation-name`, await page.evaluate(() => `${document.querySelector("[data-stepped]") ? "있음" : "없음"} / ${getComputedStyle(document.querySelector("form > :is(fieldset,section):not([hidden])")).animationName}`));

  // 팬 홈
  await page.goto(BASE + "/home", { waitUntil: "networkidle", timeout: 120000 });
  const row = page.locator("ul[aria-label='진행 중인 선물'] a").first();
  if (await row.count()) {
    await row.scrollIntoViewIfNeeded();
    const rbox = await row.boundingBox();
    await page.mouse.move(rbox.x + rbox.width / 2, rbox.y + rbox.height / 2); await page.mouse.down(); await page.waitForTimeout(250);
    log(`${tag} 홈 진행 중 줄 누른 동안 background-color / :active / hover 기기`, await row.evaluate((el) => `${getComputedStyle(el).backgroundColor} / ${el.matches(":active")} / ${matchMedia("(hover: hover)").matches}`));
    await page.mouse.up();
    log(`${tag} 홈 진행 중 줄 transition`, await row.evaluate((el) => getComputedStyle(el).transition));
  }
  await ctx.close();
}
await browser.close();
console.log(out.join("\n"));
