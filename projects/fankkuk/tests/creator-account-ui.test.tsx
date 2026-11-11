import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
const sendNotify = vi.fn();
vi.mock("@/features/creator-settings-save/api/send-creator-settings", () => ({ sendCreatorNotify: (...args: unknown[]) => sendNotify(...args) }));

import type { MyVerificationState } from "@/entities/creator/model/creator-verification";
import { CREATOR_SETTINGS } from "@/entities/session/model/home-path";
import { CreatorAccountPage } from "@/widgets/creator-account/ui/creator-account-page";

// 계정 설정(크리에이터) /creator/account — 정돈 4파트(design-rules 27절, 카드 d115, 시안 pilot-2026-10-22/creator-account.html).
// 카드 셋 대신 묶음 둘: 보안 → 알림 → 상세 설정 안내 줄 → 회원 탈퇴(맨 끝). 동작(펼치는 칸·즉시 저장·실패 시 되돌림)은 그대로.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const baseState: MyVerificationState = {
  creatorId: "c1",
  name: "하루",
  channelTitle: "하루의 놀이터",
  verified: false,
  platform: null,
  channelUrl: null,
  verifiedAt: null,
  operatorOnly: false,
  handle: null,
  nextRecheckAt: null,
  graceUntil: null,
  recheckRequestedAt: null,
};
const unverified = baseState;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  sendNotify.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(state: MyVerificationState = unverified) {
  act(() => {
    root.render(
      <CreatorAccountPage
        phoneMasked="010-****-9999"
        notify={{ kakao: true, email: false, instant: false }}
        verification={{ state, rows: [], apiPlatforms: [], loginId: "qa_c1029a" }}
      />,
    );
  });
}

const page = () => host.firstElementChild as HTMLElement;
const sectionTitles = () => [...host.querySelectorAll("section")].map((sec) => sec.querySelector("h2")?.textContent?.trim());
const buttonByText = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
const switches = () => [...host.querySelectorAll<HTMLButtonElement>('[role="switch"]')];
const flush = () => act(async () => { await Promise.resolve(); });

describe("계정 설정(크리에이터) — 묶음 순서", () => {
  it("묶음은 보안 → 알림 둘뿐이고 「개인정보」 묶음은 없다", () => {
    render();
    expect(sectionTitles()).toEqual(["보안", "알림"]);
  });

  it("보안 묶음 줄은 비밀번호 → 휴대폰 번호 → 채널 소유자 확인", () => {
    render();
    const security = host.querySelectorAll("section")[0];
    // 줄 묶음의 직접 자식(줄)을 하나씩 — 사이에 다른 줄이 끼면 길이·순서가 깨진다
    const rows = [...security.querySelector("h2")!.nextElementSibling!.children] as HTMLElement[];
    const keys = ["비밀번호", "휴대폰 번호", "채널 소유자 확인"];
    expect(rows).toHaveLength(keys.length);
    rows.forEach((row, i) => expect(row.textContent!.startsWith(keys[i])).toBe(true));
    expect(rows[1].textContent).toContain("010-****-9999");
  });

  it("페이지 자식 순서: 머리 → 보안 → 알림 → 상세 설정 안내 줄 → 회원 탈퇴(맨 끝)", () => {
    render();
    const kids = [...page().children] as HTMLElement[];
    expect(kids).toHaveLength(5);
    expect(kids[0].tagName).toBe("HEADER");
    expect(kids[1].querySelector("h2")?.textContent?.trim()).toBe("보안");
    expect(kids[2].querySelector("h2")?.textContent?.trim()).toBe("알림");
    expect(kids[3].textContent).toBe("받는 주소·차단한 팬·선물 받기는 ‘상세 설정’에서 관리해 주세요.");
    expect(kids[3].querySelector("a")?.getAttribute("href")).toBe(`${CREATOR_SETTINGS}#more`);
    expect(kids[4].textContent).toContain("회원 탈퇴");
    expect(kids[4].querySelector("button")?.textContent?.trim()).toBe("탈퇴 안내");
    expect(page().lastElementChild).toBe(kids[4]);
    for (const sec of host.querySelectorAll("section")) expect(sec.textContent).not.toContain("탈퇴 안내");
  });

  it("탈퇴 안내를 누르면 그 줄 아래 탈퇴 문의 링크가 펼쳐진다", () => {
    render();
    const leave = buttonByText("탈퇴 안내")!;
    act(() => leave.click());
    expect(leave.getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById(leave.getAttribute("aria-controls")!)!;
    expect(panel.querySelector('a[href="/support"]')?.textContent?.trim()).toBe("탈퇴 문의");
    expect(page().lastElementChild!.contains(panel)).toBe(true);
  });

  it("INV-V17: 채널 소유자 확인 — 확인 전이면 「확인 전」 뱃지, 그 줄 아래에 ① 팬꾹 링크 만들기가 늘 펼쳐져 있고 ②·요청은 링크를 만든 뒤에", () => {
    render();
    const verify = host.querySelector("#verify")!;
    expect(verify.textContent).toContain("확인 전");
    expect(verify.textContent).toContain("팬꾹 링크를 만들어 주세요");
    expect(verify.textContent).not.toContain("채널 주소를 입력해 주세요");
    expect(buttonByText("채널 확인 요청")).toBeUndefined();
    render({ ...baseState, handle: "haru" });
    expect(host.querySelector("#verify")!.textContent).toContain("활동 중인 채널에 팬꾹 링크를 올려 주세요");
    expect(buttonByText("채널 확인 요청")?.getAttribute("aria-disabled")).toBe("true");
  });

  it("INV-V20: 확인됐으면 「채널 인증이 완료되었습니다」·다음 재확인 날, 「채널 변경」을 누르면 같은 ①② 칸이 펼쳐진다", () => {
    render({
      ...baseState,
      handle: "haru",
      verified: true,
      channelUrl: "https://www.youtube.com/@honeypot",
      verifiedAt: "2026-11-02T03:00:00Z",
      nextRecheckAt: "2027-01-31T03:00:00Z",
    });
    const verify = host.querySelector("#verify")!;
    expect(verify.textContent).toContain("확인 완료");
    expect(verify.textContent).toContain("채널 인증이 완료되었습니다 · 2026.11.02");
    expect(verify.textContent).toContain("다음 재확인 2027.01.31");
    expect(verify.textContent).not.toContain("팬꾹 링크를 올려 주세요");
    const btn = buttonByText("채널 변경")!;
    act(() => btn.click());
    const panel = document.getElementById(btn.getAttribute("aria-controls")!)!;
    expect(verify.contains(panel)).toBe(true);
    expect(panel.textContent).toContain("팬꾹 링크를 올린 채널 주소를 입력해 주세요");
  });

  it("INV-U14 (S14e, 실패경로): 팬꾹 링크 칸에 로그인 아이디와 같은 값(대소문자만 다름)을 넣으면 서버에 묻지 않고 「로그인 아이디와 다르게 정해 주세요.」", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ result: "available" })));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      render();
      const input = host.querySelector<HTMLInputElement>("#verify input[placeholder='haru']")!;
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      act(() => {
        setValue.call(input, "QA_C1029A");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });
      // 칸 아래 안내 칸 하나만 본다 — 칸 아래 고정 안내(「로그인 아이디와 다르게 정해 주세요. 만든 뒤…」)가 같은 문장으로 시작해서 카드 전체로 보면 늘 통과한다
      const lineBox = host.querySelector(`[id="${input.getAttribute("aria-describedby")!.split(" ")[0]}"]`)!;
      expect(lineBox.id.endsWith("-link-line")).toBe(true);
      expect(lineBox.textContent).toContain("로그인 아이디와 다르게 정해 주세요.");
      expect(lineBox.textContent).not.toContain("쓸 수 있어요.");
      expect(host.querySelector<HTMLButtonElement>("#verify button.btn")?.textContent).toBe("만들기");
      expect([...host.querySelectorAll("#verify button")].find((b) => b.textContent === "만들기")?.getAttribute("aria-disabled")).toBe("true");
      expect(fetchSpy).not.toHaveBeenCalled();
      // 다른 값이면 서버에 묻는다 — 위 단언이 「아무 값도 묻지 않음」으로 통과하지 않게
      act(() => {
        setValue.call(input, "qalink1029");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("INV-V20: 유예 중이면 「링크 확인 필요」·유예 끝 날·「채널 확인 재요청」 — 남은 요청 횟수는 없다(INV-V15)", () => {
    render({ ...baseState, handle: "haru", verified: true, graceUntil: "2026-11-16T03:00:00Z" });
    const verify = host.querySelector("#verify")!;
    expect(verify.textContent).toContain("링크 확인 필요");
    expect(verify.textContent).toContain("활동 중인 채널에서 팬꾹 링크를 찾지 못했어요. 11월 16일까지 다시 올려 주세요");
    expect(buttonByText("채널 확인 재요청")).toBeDefined();
    expect(verify.textContent).not.toMatch(/남은|[0-9]+ *(번|회)/);
  });
});

describe("계정 설정(크리에이터) — 알림", () => {
  it("스위치는 줄 전체가 버튼이다 — 이름·설명·막대가 버튼 안에 있다", () => {
    render();
    const [kakao, mail] = switches();
    const label = document.getElementById(kakao.getAttribute("aria-labelledby")!)!;
    expect(kakao.contains(label)).toBe(true);
    expect(label.textContent).toContain("카카오톡 알림");
    expect(label.textContent).toContain("필수 알림 외 소식을 알림톡으로 수신");
    expect(kakao.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(mail.getAttribute("aria-checked")).toBe("false");
  });

  it("스위치 이름 글자를 눌러도 토글되고 즉시 저장한다", async () => {
    sendNotify.mockResolvedValue({ kind: "ok" });
    render();
    const mail = switches()[1];
    const name = document.getElementById(mail.getAttribute("aria-labelledby")!)!.firstElementChild as HTMLElement;
    expect(name.textContent).toBe("이메일 알림");
    act(() => name.click());
    expect(mail.getAttribute("aria-checked")).toBe("true");
    expect(sendNotify).toHaveBeenCalledWith({ kakao: true, email: true, instant: false });
    await flush();
    expect(host.querySelector('[data-ca-group="notify"] [role="status"]')?.textContent).toBe("알림 설정이 저장되었습니다.");
  });

  it("저장에 실패하면 스위치가 저장된 값으로 되돌아가고 실패 문구가 알림 묶음 끝에 나온다", async () => {
    sendNotify.mockResolvedValue({ kind: "failed", message: "저장하지 못했어요." });
    render();
    const kakao = switches()[0];
    act(() => kakao.click());
    expect(kakao.getAttribute("aria-checked")).toBe("false");
    await flush();
    expect(kakao.getAttribute("aria-checked")).toBe("true");
    const notify = host.querySelectorAll("section")[1];
    const alert = notify.querySelector('[role="alert"]')!;
    expect(alert.textContent).toBe("저장하지 못했어요.");
  });

  it("저장하는 동안에는 다른 스위치를 눌러도 다시 보내지 않고 값도 바뀌지 않는다", async () => {
    let finish: (v: { kind: "ok" }) => void = () => {};
    sendNotify.mockReturnValue(new Promise((res) => { finish = res; }));
    render();
    const [kakao, mail] = switches();
    act(() => kakao.click());
    expect(sendNotify).toHaveBeenCalledTimes(1);
    expect(mail.getAttribute("aria-disabled")).toBe("true");
    act(() => mail.click());
    expect(sendNotify).toHaveBeenCalledTimes(1);
    expect(mail.getAttribute("aria-checked")).toBe("false");
    await act(async () => { finish({ kind: "ok" }); await Promise.resolve(); });
    expect(mail.getAttribute("aria-disabled")).toBe("false");
  });

  it("notify-settings: 셋째 스위치 「선물 소식 바로 받기」 — 누르면 즉시 셋 다 보내고, 실패하면 되돌린다", async () => {
    sendNotify.mockResolvedValue({ kind: "ok" });
    render();
    expect(switches()).toHaveLength(3);
    const instant = switches()[2]!;
    const label = document.getElementById(instant.getAttribute("aria-labelledby")!)!;
    expect(label.firstElementChild?.textContent).toBe("선물 소식 바로 받기");
    expect(label.lastElementChild?.textContent).toBe("끄면 하루 한 번 오후 7시에 모아서 보냅니다");
    expect(instant.getAttribute("aria-checked")).toBe("false");
    act(() => instant.click());
    expect(sendNotify).toHaveBeenCalledWith({ kakao: true, email: false, instant: true });
    await flush();
    expect(instant.getAttribute("aria-checked")).toBe("true");

    sendNotify.mockResolvedValue({ kind: "failed", message: "저장하지 못했어요." });
    act(() => instant.click());
    expect(instant.getAttribute("aria-checked")).toBe("false");
    await flush();
    expect(instant.getAttribute("aria-checked")).toBe("true");
  });

  it("필수 알림 안내는 알림 묶음 안에 제목 줄과 목록으로 늘 보이고, 결과 안내 자리는 묶음 끝에 있다", () => {
    render();
    const notify = host.querySelectorAll("section")[1];
    const must = notify.querySelector("strong")!;
    expect(must.textContent).toContain("필수 알림:");
    expect(must.closest("details")).toBeNull();
    expect(must.textContent).toContain("승인 요청 · 추적 장치 발견 · 선물 수령 여부 확인 · 반송 주소 확인");
    const rows = notify.querySelector("h2")!.nextElementSibling as HTMLElement;
    const last = rows.lastElementChild as HTMLElement;
    expect(last.querySelector('[role="status"]')).not.toBeNull();
    expect(last.querySelector('[role="alert"]')).not.toBeNull();
    expect(last.previousElementSibling?.contains(must)).toBe(true);
  });
});

describe("채널 없는 크리에이터 (signup INV-U21 · UX 명세 「가입 밖에서 바뀌는 것」)", () => {
  it("INV-U21: 채널이 없으면 채널 소유자 확인 줄에 ①②(팬꾹 링크·채널 주소) 대신 「채널 만들기」 링크 하나", () => {
    render({ ...baseState, name: null });
    const row = host.querySelector("#verify")!;
    expect(row.textContent).toContain("채널 소유자 확인");
    expect(row.textContent).toContain("채널 없음");
    expect([...row.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")])).toEqual([["채널 만들기", "/signup/creator"]]);
    expect(row.querySelector("input")).toBeNull();
  });

  it("INV-U21 (실패경로): 채널이 있으면 지금 채널 확인 그대로 — 「채널 만들기」 링크가 없다", () => {
    render();
    expect(host.querySelector("#verify")?.textContent).not.toContain("채널 없음");
    expect([...host.querySelectorAll("#verify a")].map((a) => a.textContent)).not.toContain("채널 만들기");
  });
});
