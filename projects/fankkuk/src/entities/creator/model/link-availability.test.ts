import { describe, expect, it } from "vitest";
import { LINK_AVAILABILITY_LINE, linkMakerState } from "./link-availability";

// 채널 확인 단계 ① 팬꾹 링크 만들기 칸의 안내와 「만들기」 켜짐 (signup INV-U14, creator-link INV-E2).

const LOGIN = "qa_c1029a";

describe("INV-U14: 팬꾹 링크 만들기 칸 — 안내 한 줄·서버에 물을 값·「만들기」", () => {
  it("INV-U14: 빈 값이면 안내도 묻기도 없고 「만들기」는 꺼진다", () => {
    expect(linkMakerState({ draft: "  ", loginId: LOGIN, check: null })).toEqual({ value: "", line: null, ask: null, canMake: false });
  });

  it("INV-U14 (S14e, 실패경로): 꼴이 틀리면 「형식이 맞지 않아요.」, 서버에 묻지 않고 꺼진다", () => {
    for (const draft of ["ha-ru", "ab", "a".repeat(21), "하루"]) {
      expect([draft, linkMakerState({ draft, loginId: LOGIN, check: null })]).toEqual([draft, { value: draft.toLowerCase(), line: LINK_AVAILABILITY_LINE.invalid, ask: null, canMake: false }]);
    }
  });

  it("INV-U14 (S14e, 실패경로): 로그인 아이디와 같으면(대소문자·앞뒤 공백만 다름) 「로그인 아이디와 다르게」, 묻지 않고 꺼진다 — 서버 답이 「쓸 수 있어요」여도", () => {
    const st = linkMakerState({ draft: " QA_C1029A ", loginId: LOGIN, check: { value: "qa_c1029a", status: "available" } });
    expect(st).toEqual({ value: "qa_c1029a", line: LINK_AVAILABILITY_LINE.sameAsLogin, ask: null, canMake: false });
  });

  it("INV-U14: 로그인 아이디를 모르면(null) 같은지 보지 않고 서버에 묻는다", () => {
    expect(linkMakerState({ draft: "qa_c1029a", loginId: null, check: null }).ask).toBe("qa_c1029a");
  });

  it("INV-U14: 지금 값의 답이 없거나 이전 값의 답이면 「확인 중…」, 묻는 값은 지금 값, 꺼진다", () => {
    expect(linkMakerState({ draft: "haru", loginId: LOGIN, check: null })).toEqual({ value: "haru", line: LINK_AVAILABILITY_LINE.checking, ask: "haru", canMake: false });
    expect(linkMakerState({ draft: "haru", loginId: LOGIN, check: { value: "har", status: "available" } }).line).toBe(LINK_AVAILABILITY_LINE.checking);
  });

  it("INV-U14: 지금 값의 답이 「쓸 수 있어요」일 때만 「만들기」가 켜진다", () => {
    expect(linkMakerState({ draft: "Haru", loginId: LOGIN, check: { value: "haru", status: "available" } })).toEqual({
      value: "haru",
      line: LINK_AVAILABILITY_LINE.available,
      ask: "haru",
      canMake: true,
    });
  });

  it("INV-U14 (S14d, 실패경로): 이미 씀·쓸 수 없는 주소·잠시 뒤·요청 실패·서버가 형식 틀림이라 하면 그 안내, 꺼진다", () => {
    for (const status of ["taken", "reserved", "rate_limited", "error", "invalid", "checking"] as const) {
      const st = linkMakerState({ draft: "haru", loginId: LOGIN, check: { value: "haru", status } });
      expect([status, st.line, st.canMake]).toEqual([status, LINK_AVAILABILITY_LINE[status], false]);
    }
  });
});
