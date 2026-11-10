import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { SignupCreatorSteps } from "./signup-creator-steps";

// 크리에이터 3단계 서명 완료(kakao_done) — 계정이 생겨 로그인된 라우트(/signup/creator?step=3)에서 그린다(UX 명세 signup.md 2026-11-10).
// 머리글은 서버가 로그인 상태로 그리고, 가입 화면(/signup)을 다시 그리다 첫 화면으로 넘어가 4단계를 건너뛰는 일이 없다.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("kakao_done (signup INV-U19)", () => {
  it("INV-U19 ①: 완료 상자 · 단계 줄 1~3 체크(3 이 지금 단계) · 「다음」 하나가 4단계로 — 「이전」 없음", () => {
    act(() => root.render(<SignupCreatorSteps view="kakao-done" />));
    expect(host.textContent).toContain("카카오톡 인증 알림 연결이 완료되었습니다.");
    const steps = [...host.querySelectorAll("nav li")];
    expect(steps.map((li) => (li.querySelector("svg") ? "체크" : li.textContent?.slice(0, 1)))).toEqual(["체크", "체크", "체크", "4"]);
    expect(steps[2]?.querySelector("[aria-current=step]")).not.toBeNull();
    const actions = [...host.querySelectorAll(".card a, .card button")].map((a) => [a.textContent, a.getAttribute("href")]);
    expect(actions).toEqual([["다음", "/signup/creator"]]);
  });
});
