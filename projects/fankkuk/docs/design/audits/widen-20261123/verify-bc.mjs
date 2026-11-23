// B·C 넓히기(2026-11-23) 확인 — 단계 넘김·펼침 등장을 계산된 스타일로 잰다. 제출하지 않는다(신청·받기·만들기·가입 모두 마지막 버튼은 안 누름).
// 사용: node verify-bc.mjs http://localhost:3000   (로컬 개발 서버만)
// 필요한 로컬 데이터: 하루의 공개 선물함 c05e0aa4-e46d-47d3-9e0f-e4685c626a80 · 별빛 팬이 받을 역조공 RG-TMEAS10(넓히기기록 B·C 절). 잰 뒤 지운다.
import { createRequire } from "node:module";
const require = createRequire("C:/Users/PC/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/");
const { chromium } = require("playwright");
const BASE = process.argv[2];
const BOX = "/gift-boxes/c05e0aa4-e46d-47d3-9e0f-e4685c626a80";
const RG = "/gifts/RG-TMEAS10";

const log = (k, v) => console.log(`${k}: ${v}`);
const ANIM = (sel) => { const t = document.querySelector(sel); return t ? getComputedStyle(t).animationName : "요소 없음"; };
const tick = (page) => page.waitForTimeout(40);

async function login(page, id) {
  await page.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 120000 });
  await page.locator('input[autocomplete="username"]').fill(id);
  await page.locator('input[autocomplete="current-password"]').fill("fankkuk-local-1234");
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60000 }), page.locator('button[type="submit"]').click()]);
}

const browser = await chromium.launch();
for (const reduce of [false, true]) {
  const tag = reduce ? "[움직임 줄이기]" : "[기본]";
  const opts = { locale: "ko-KR", viewport: { width: 1440, height: 900 }, reducedMotion: reduce ? "reduce" : "no-preference" };

  // ── 회원가입(로그인 전)
  {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await page.goto(BASE + "/signup", { waitUntil: "networkidle", timeout: 120000 });
    log(`${tag} 가입 처음 1단계`, await page.evaluate(ANIM, "fieldset:not([hidden])"));
    await page.getByRole("button", { name: "다음" }).click();
    await tick(page);
    log(`${tag} 가입 2단계로 넘긴 직후`, await page.evaluate(ANIM, "fieldset:not([hidden])"));
    await page.getByRole("button", { name: "이전" }).click();
    await tick(page);
    log(`${tag} 가입 1단계로 돌아온 직후`, await page.evaluate(ANIM, "fieldset:not([hidden])"));
    await ctx.close();
  }

  // ── 크리에이터: 선물함 만들기 창 · 설정 접기
  {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await login(page, "haru_creator");
    await page.goto(BASE + "/creator/revgift-boxes/new", { waitUntil: "networkidle", timeout: 120000 });
    await page.locator("dialog[open]").waitFor();
    log(`${tag} 만들기 창 처음 본문`, await page.evaluate(ANIM, "dialog[open] [data-turn], dialog[open] form"));
    await page.locator("#bc-name").fill("측정 상자");
    await page.locator("dialog[open]").getByRole("button", { name: "다음" }).click();
    await tick(page);
    log(`${tag} 만들기 창 2단계 직후 본문`, await page.evaluate(() => { const b = document.querySelector("dialog[open] [data-turn]"); return b ? `${b.dataset.turn} ${getComputedStyle(b).animationName}` : "data-turn 없음"; }));
    await page.locator("#bc-count").fill("5");
    await page.locator("dialog[open]").getByRole("button", { name: "다음" }).click();
    await tick(page);
    log(`${tag} 만들기 창 3단계 직후 본문`, await page.evaluate(() => { const b = document.querySelector("dialog[open] [data-turn]"); return b ? `${b.dataset.turn} ${getComputedStyle(b).animationName}` : "data-turn 없음"; }));
    log(`${tag} 만들기 창 3단계 이름 칸 값 유지(이전 눌러 확인)`, await (async () => {
      await page.locator("dialog[open]").getByRole("button", { name: "이전" }).click();
      await page.locator("dialog[open]").getByRole("button", { name: "이전" }).click();
      await tick(page);
      return await page.locator("#bc-name").inputValue();
    })());

    await page.goto(BASE + "/creator/settings", { waitUntil: "networkidle", timeout: 120000 });
    const folds = page.locator("details > summary");
    const n = await folds.count();
    log(`${tag} 설정 접기 줄 수`, n);
    const res = [];
    for (let i = 0; i < n; i++) {
      await folds.nth(i).click();
      await tick(page);
      res.push(await page.evaluate((i) => getComputedStyle(document.querySelectorAll("details")[i].querySelector(":scope > :not(summary)")).animationName, i));
    }
    log(`${tag} 설정 접기 펼친 내용`, res.join(" | "));
    await ctx.close();
  }

  // ── 팬: 선물함 신청 창 · 역조공 받기
  {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await login(page, "byeolbit_fan");
    await page.goto(BASE + BOX, { waitUntil: "networkidle", timeout: 120000 });
    await page.getByRole("button", { name: /^(선물함 신청|대기 신청)$/ }).first().click();
    const dlg = page.locator("dialog[open]");
    await dlg.waitFor();
    log(`${tag} 신청 창 처음 본문 data-turn`, await page.evaluate(() => document.querySelector("dialog[open] [data-turn]") ? "있음" : "없음"));
    await page.locator("[id$='-zipCode']").first().fill("06236");
    await page.locator("[id$='-address1']").first().fill("서울 강남구 테헤란로 1");
    await dlg.getByRole("button", { name: "다음" }).click();
    await tick(page);
    log(`${tag} 신청 창 2단계 직후 본문`, await page.evaluate(() => { const b = document.querySelector("dialog[open] [data-turn]"); return b ? `${b.dataset.turn} ${getComputedStyle(b).animationName}` : "data-turn 없음"; }));
    await page.keyboard.press("Escape");

    await page.goto(BASE + RG, { waitUntil: "networkidle", timeout: 120000 });
    log(`${tag} 받기 처음 고르는 칸`, await page.evaluate(ANIM, "[class*='ask']"));
    await page.getByRole("button", { name: "받기", exact: true }).click();
    await tick(page);
    log(`${tag} 「받기」 뒤 주소 칸`, await page.evaluate(ANIM, "[class*='addr']"));
    await page.getByRole("button", { name: "취소" }).first().click();
    await tick(page);
    log(`${tag} 취소로 돌아온 고르는 칸`, await page.evaluate(ANIM, "[class*='ask']"));
    await ctx.close();
  }
}
await browser.close();
