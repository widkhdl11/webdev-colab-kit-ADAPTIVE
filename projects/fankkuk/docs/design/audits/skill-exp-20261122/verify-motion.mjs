// 캡처로 안 보이는 변경(등장·누름·움직임 줄이기)을 계산된 스타일로 확인한다. 읽기만.
// 사용: node verify-motion.mjs <서버 주소>   (로컬 개발 서버만 — 팔로우를 실제로 바꿨다가 되돌린다)
import { createRequire } from "node:module";
const require = createRequire("C:/Users/PC/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/");
const { chromium } = require("playwright");
const BASE = process.argv[2];
const CREATOR = "/creators/00000000-0000-4000-b000-000000000001";

const out = [];
const log = (k, v) => { out.push(`${k}: ${v}`); console.log(`${k}: ${v}`); }; // 바로 찍는다 — 중간에 멈춰도 앞 결과가 남게
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

  // 2026-11-23 넓히기 D — 팔로우 버튼(공용 FollowButton·상세 묶음). 바뀐 글자는 나타나기만(label-in), 커지지 않는다(최대 크기 1).
  // 로컬 DB 의 팔로우를 실제로 바꿨다가 되돌린다(취소는 확인 창을 거친다). 팔로우 목록은 취소하면 카드가 빠지므로 누름만 잰다
  async function pressOf(btn) {
    await btn.scrollIntoViewIfNeeded();
    const b = await btn.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(200);
    const t = await btn.evaluate((el) => getComputedStyle(el).transform);
    await page.mouse.move(2, 2); await page.mouse.up(); // 다른 곳에서 떼어 눌림(click)이 일어나지 않게
    return t;
  }
  async function swapOf() {
    // 상태가 바뀐 뒤 0.4초 동안 바뀐 글자에 붙은 효과 이름과 가장 큰 크기
    let name = "효과 없음", max = 0;
    for (let k = 0; k < 25; k++) {
      const r = await page.evaluate(() => { const e = document.querySelector("[class*='swapIn']"); return e ? [getComputedStyle(e).animationName, getComputedStyle(e).transform] : null; });
      if (r) { name = r[0]; max = Math.max(max, r[1] === "none" ? 1 : Number(r[1].slice(7).split(",")[0])); }
      await page.waitForTimeout(16);
    }
    return `${name} · 최대 크기 ${max || "-"}`;
  }
  async function unfollow(btn) {
    await btn.click();
    await page.getByRole("dialog").getByRole("button", { name: "팔로우 취소" }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" }); // 창이 떠 있는 동안 바깥은 비활성이라 버튼을 못 찾는다
  }
  for (const [label, path] of [["상세", CREATOR], ["찾기", "/creators"], ["팬 홈", "/home"]]) {
    await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 120000 });
    const follow = page.getByRole("button", { name: /팔로우$/ }).filter({ visible: true }).first();
    const undo = page.getByRole("button", { name: /팔로우 (중|취소)$/ }).filter({ visible: true }).first();
    if (await follow.count()) {
      const who = (await follow.getAttribute("aria-label")).replace(/님? 팔로우$/, "");
      log(`${tag} ${label} 「팔로우」 누른 동안 transform`, await pressOf(follow));
      await follow.click();
      log(`${tag} ${label} 팔로우 뒤 바뀐 글자`, await swapOf());
      await unfollow(page.getByRole("button", { name: new RegExp("^" + who + "님? 팔로우 (중|취소)$") }).filter({ visible: true }).first());
      log(`${tag} ${label} 되돌린 뒤 바뀐 글자`, await swapOf());
    } else if (await undo.count()) {
      // 이미 팔로우 중인 크리에이터뿐이면 반대 순서로 — 취소 뒤 다시 팔로우
      const who = (await undo.getAttribute("aria-label")).replace(/님? 팔로우 (중|취소)$/, "");
      log(`${tag} ${label} 「팔로우 중·취소」 누른 동안 transform`, await pressOf(undo));
      await unfollow(undo);
      log(`${tag} ${label} 취소 뒤 바뀐 글자`, await swapOf());
      const again = page.getByRole("button", { name: new RegExp("^" + who + "님? 팔로우$") }).filter({ visible: true }).first();
      await page.waitForTimeout(800);
      if (await again.count()) {
        await again.click();
        log(`${tag} ${label} 다시 팔로우 뒤 바뀐 글자`, await swapOf());
      } else {
        // 팬 홈의 팔로우 카드 묶음은 취소하면 카드가 빠진다 — 크리에이터 상세에서 다시 팔로우해 되돌린다
        log(`${tag} ${label} 취소 뒤`, "카드가 목록에서 빠짐(다시 팔로우는 크리에이터 상세에서)");
        await page.goto(BASE + CREATOR, { waitUntil: "networkidle", timeout: 120000 });
        await page.getByRole("button", { name: new RegExp("^" + who + "님? 팔로우$") }).filter({ visible: true }).first().click();
        await page.waitForTimeout(1500);
      }
    } else log(`${tag} ${label} 팔로우 버튼`, "없음");
  }
  await page.goto(BASE + "/me/following", { waitUntil: "networkidle", timeout: 120000 });
  const fb = page.getByRole("button", { name: /팔로우 취소$/ }).filter({ visible: true }).first();
  log(`${tag} 팔로우 목록 「팔로우 취소」 누른 동안 transform`, (await fb.count()) ? await pressOf(fb) : "카드 없음");

  // 2026-11-23 넓히기 A — 문서 목차 판(휴대폰 폭의 「목차 열기」). 자주 묻는 질문·공지 접기는 이미 사이트 접기 등장이 있어 확인만 한다
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(BASE + "/pricing", { waitUntil: "networkidle", timeout: 120000 });
  const toc = page.getByRole("button", { name: "목차 열기" }).filter({ visible: true }).first();
  const panelId = await toc.getAttribute("aria-controls"); // 누르면 이름이 「목차 닫기」로 바뀌어 먼저 읽는다
  await toc.click();
  log(`${tag} 요금 안내 목차 판 animation-name`, await page.locator(`#${panelId}`).evaluate((e) => getComputedStyle(e).animationName));
  for (const [label, path] of [["자주 묻는 질문", "/faq"], ["공지", "/notices"]]) {
    await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 120000 });
    const sum = await page.locator(".acc details:not([open]) > summary").filter({ visible: true }).first().elementHandle();
    await sum.click(); await page.waitForTimeout(60);
    log(`${tag} ${label} 펼친 내용 animation-name`, await sum.evaluate((el) => getComputedStyle(el.parentElement.querySelector(":scope > :not(summary)")).animationName));
  }
  await ctx.close();
}
await browser.close();
