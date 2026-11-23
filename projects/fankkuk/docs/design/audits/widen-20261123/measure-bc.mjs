// 선물함 신청 창 · 역조공 받기 단계의 등장 유무를 계산된 스타일로 잰다. 제출하지 않는다(읽기만).
// 사용: node measure-bc.mjs http://localhost:3000
// 잰 데이터(하루의 공개 선물함 c05e0aa4…·역조공 RG-TMEAS10)는 잰 뒤 지웠다 — 다시 재려면 같은 것을 로컬에 만들고 BOX·RG 를 바꾼다(넓히기기록 B·C 절).
import { createRequire } from "node:module";
const require = createRequire("C:/Users/PC/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/");
const { chromium } = require("playwright");
const BASE = process.argv[2];
const BOX = "/gift-boxes/c05e0aa4-e46d-47d3-9e0f-e4685c626a80";
const RG = "/gifts/RG-TMEAS10";

const log = (k, v) => console.log(`${k}: ${v}`);
const ANIM = (sel) => { const t = document.querySelector(sel); if (!t) return "요소 없음"; const c = getComputedStyle(t); return `${c.animationName} ${c.animationDuration} / transition ${c.transitionProperty} ${c.transitionDuration}`; };
const ANIM_EL = (t) => { const c = getComputedStyle(t); return `${c.animationName} ${c.animationDuration} / transition ${c.transitionProperty} ${c.transitionDuration}`; };
const anim = (sel) => (el) => {
  const t = sel ? document.querySelector(sel) : el;
  if (!t) return "요소 없음";
  const c = getComputedStyle(t);
  return `${c.animationName} ${c.animationDuration} / transition ${c.transitionProperty} ${c.transitionDuration}`;
};
const browser = await chromium.launch();
for (const reduce of [false, true]) {
  const tag = reduce ? "[움직임 줄이기]" : "[기본]";
  const ctx = await browser.newContext({ locale: "ko-KR", viewport: { width: 1440, height: 900 }, reducedMotion: reduce ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 120000 });
  await page.locator('input[autocomplete="username"]').fill("byeolbit_fan");
  await page.locator('input[autocomplete="current-password"]').fill("fankkuk-local-1234");
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60000 }), page.locator('button[type="submit"]').click()]);

  // ── 선물함 신청 창
  await page.goto(BASE + BOX, { waitUntil: "networkidle", timeout: 120000 });
  const applyBtn = page.getByRole("button", { name: /^(선물함 신청|대기 신청)$/ });
  if ((await applyBtn.count()) === 0) {
    log(`${tag} 선물함 신청 버튼`, "없음 — 화면 글: " + (await page.locator("main").innerText()).slice(0, 200).replace(/\s+/g, " "));
  } else {
    await applyBtn.first().click();
    const dlg = page.locator("dialog[open]");
    await dlg.waitFor();
    log(`${tag} 신청 창 자체(dialog)`, await dlg.evaluate(ANIM_EL));
    log(`${tag} 신청 창 1단계 칸`, await page.evaluate(ANIM, "dialog[open] form > div:not([hidden])"));
    await page.locator("#ba-zipCode, [id$='-zipCode']").first().fill("06236");
    await page.locator("[id$='-address1']").first().fill("서울 강남구 테헤란로 1");
    await page.locator("[id$='-address2']").first().fill("101호");
    await dlg.getByRole("button", { name: "다음" }).click();
    await page.waitForTimeout(30);
    log(`${tag} 신청 창 2단계로 넘긴 직후`, await page.evaluate(ANIM, "dialog[open] form > div:not([hidden])"));
    await page.locator("[id$='-recipientName']").first().fill("별빛");
    await page.locator("[id$='-phone']").first().fill("010-1234-5678");
    await dlg.getByRole("button", { name: "다음" }).click();
    await page.waitForTimeout(30);
    const step3 = await page.evaluate(() => {
      const f = document.querySelector("dialog[open] form");
      const vis = [...(f?.children ?? [])].filter((e) => !e.hidden && e.offsetParent !== null);
      return vis.map((e) => `${e.tagName.toLowerCase()}.${e.className.split(" ")[0]}=${getComputedStyle(e).animationName}`).join(" | ");
    });
    log(`${tag} 신청 창 3단계(확인) 직후 보이는 칸`, step3);
    log(`${tag} 신청 창 진행 표시 막대`, await page.evaluate(ANIM, "dialog[open] .mini-steps i.on, dialog[open] .dots span.on"));
    await page.keyboard.press("Escape"); // 제출하지 않고 닫는다
  }

  // ── 역조공 받기
  await page.goto(BASE + RG, { waitUntil: "networkidle", timeout: 120000 });
  const recv = page.getByRole("button", { name: "받기", exact: true });
  if ((await recv.count()) === 0) {
    log(`${tag} 받기 버튼`, "없음 — 화면 글: " + (await page.locator("main").innerText()).slice(0, 200).replace(/\s+/g, " "));
  } else {
    log(`${tag} 받기 고르는 칸(처음)`, await page.evaluate(ANIM, "[class*='ask']"));
    await recv.click();
    await page.waitForTimeout(30);
    log(`${tag} 「받기」 뒤 주소 입력 칸`, await page.evaluate(ANIM, "[class*='addr']"));
    await page.getByRole("button", { name: /취소|이전/ }).first().click().catch(() => {});
    await page.waitForTimeout(30);
    log(`${tag} 취소로 돌아온 고르는 칸`, await page.evaluate(ANIM, "[class*='ask']"));
    await page.locator("details[class*='fold'] > summary").first().click();
    await page.waitForTimeout(30);
    log(`${tag} 「선물 정보」 접기 펼친 내용`, await page.evaluate(ANIM, "details[class*='fold'][open] > :not(summary)"));
    await page.getByRole("button", { name: "받지 않기" }).click();
    await page.waitForTimeout(30);
    log(`${tag} 「받지 않기」 확인 시트`, await page.evaluate(ANIM, "dialog[open]"));
  }
  await ctx.close();
}
await browser.close();
