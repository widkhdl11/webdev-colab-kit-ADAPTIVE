import { describe, expect, it } from "vitest";
import {
  CARD_NAME_MAX,
  cardNameSize,
  cardTextSizes,
  creatorNameOrWithdrawn,
  dotDate,
  normalizeReplyLine,
  monthDayText,
  normalizeXHandle,
  RECEIVED_BOXES_MAX,
  receivedListCapped,
  REPLY_INPUT_MESSAGE,
  REPLY_LINE_MAX,
  REPLY_PHRASE_TEXT,
  REPLY_PHRASES,
  replyActionsOf,
  replyLineMessage,
  replyLineProblem,
  shareTextOf,
  X_HANDLE_PATTERN,
  xIntentUrl,
} from "./reply";

// 받았어요·답장 화면 쪽 규칙 (gift-reply INV-G3·G9). DB 저장 함수가 같은 규칙으로 다시 검사한다 — 통합 시험(gift-reply-db)이 그쪽을 본다.

describe("INV-G3: 정해진 문구 다섯 + 한 줄 80자", () => {
  it("INV-G3: 문구는 스펙의 다섯 개, 스펙 순서", () => {
    expect(REPLY_PHRASES.map((p) => REPLY_PHRASE_TEXT[p])).toEqual([
      "잘 받았어요, 고마워요",
      "너무 마음에 들어요",
      "잘 쓸게요",
      "덕분에 힘이 났어요",
      "정성이 느껴져서 감동이에요",
    ]);
  });

  it("INV-G3 (실패경로): 81자·줄바꿈·줄 구분자·보이지 않는 글자는 꼴 문제, 앞뒤 공백을 뺀 80자·이모지 80개는 통과", () => {
    expect(REPLY_LINE_MAX).toBe(80);
    expect(replyLineProblem("가".repeat(81))).toBe("too_long");
    expect(replyLineProblem("첫 줄\n둘째 줄")).toBe("forbidden_chars");
    expect(replyLineProblem("첫 줄 둘째 줄")).toBe("forbidden_chars");
    expect(replyLineProblem("보이지​않음")).toBe("forbidden_chars");
    expect(replyLineProblem(normalizeReplyLine(`  ${"가".repeat(80)}  `))).toBeNull();
    expect(replyLineProblem("😀".repeat(80))).toBeNull();
    expect(normalizeReplyLine("   ")).toBeNull();
    expect(replyLineProblem(null)).toBeNull();
  });
});

describe("INV-G9: 공유 글·X 계정", () => {
  it("INV-G9 S9b: 태그가 없으면 「#팬꾹」만, 있으면 「@계정」이 붙는다", () => {
    expect(shareTextOf(null)).toBe("#팬꾹");
    expect(shareTextOf("haru_tv")).toBe("#팬꾹 @haru_tv");
  });

  it("INV-G9 (실패경로): 꼴이 아닌 태그 값은 붙이지 않는다 — 글에 다른 말이 섞일 자리가 없다", () => {
    expect(shareTextOf("haru tv https://evil.example")).toBe("#팬꾹");
    expect(shareTextOf("a".repeat(16))).toBe("#팬꾹");
  });

  it("INV-G9: X 글쓰기 창 주소는 글만 담는다", () => {
    expect(xIntentUrl("#팬꾹 @haru_tv")).toBe("https://x.com/intent/post?text=%23%ED%8C%AC%EA%BE%B9%20%40haru_tv");
  });

  it("INV-G8: X 계정 입력 — 앞뒤 공백과 맨 앞 @ 하나를 떼고, 영문·숫자·밑줄 1~15자만 꼴에 맞는다", () => {
    expect(normalizeXHandle("  @Haru_TV ")).toBe("Haru_TV");
    expect(normalizeXHandle("   ")).toBeNull();
    for (const ok of ["a", "Haru_TV_15chars", "x_1"]) expect(X_HANDLE_PATTERN.test(ok)).toBe(true);
    for (const bad of ["a".repeat(16), "하루", "ha-ru", "ha ru", "@@haru"]) expect(X_HANDLE_PATTERN.test(normalizeXHandle(bad) ?? "")).toBe(false);
  });
});

describe("공유 카드 글자 크기 — 길이에 따라 줄인다", () => {
  it("짧으면 시안 크기, 길수록 작아지고, 짝수 픽셀이다", () => {
    const short = cardTextSizes("잘 쓸게요", null, "square");
    expect(short).toEqual({ phrase: 80, line: 42 });
    const long = cardTextSizes("정성이 느껴져서 감동이에요", "가".repeat(80), "square");
    expect(long.phrase).toBeLessThan(short.phrase);
    expect(long.line).toBeLessThan(short.line);
    for (const n of [long.phrase, long.line, ...Object.values(cardTextSizes("잘 쓸게요", "가".repeat(40), "wide"))]) expect(n % 2).toBe(0);
    expect(cardTextSizes("잘 쓸게요", null, "wide")).toEqual({ phrase: 64, line: 34 });
  });
});

describe("날짜·탈퇴 표시", () => {
  it("INV-G6: 날짜는 YYYY-MM-DD 만 점 날짜로 — 시각이 섞인 값은 그리지 않는다", () => {
    expect(dotDate("2026-10-05")).toBe("2026.10.05");
    expect(dotDate("2026-10-05T09:30:00Z")).toBe("");
  });

  it("탈퇴한 크리에이터는 이름 자리에 「탈퇴한 크리에이터」", () => {
    expect(creatorNameOrWithdrawn(null)).toBe("탈퇴한 크리에이터");
    expect(creatorNameOrWithdrawn("하루")).toBe("하루");
  });
});

describe("크리에이터가 상자에 할 수 있는 일 (INV-G2·G4)", () => {
  it("INV-G2·G4: 없음 → 받았어요 / 확인만 → 답장 더하기 / 답장함 → 지우기 / 지움 → 아무것도", () => {
    expect(replyActionsOf("none")).toEqual({ confirm: true, addReply: false, remove: false });
    expect(replyActionsOf("confirmed")).toEqual({ confirm: false, addReply: true, remove: false });
    expect(replyActionsOf("replied")).toEqual({ confirm: false, addReply: false, remove: true });
    expect(replyActionsOf("deleted")).toEqual({ confirm: false, addReply: false, remove: false });
  });

  it("날짜는 「10월 8일」, 시각이 섞인 값은 그리지 않는다", () => {
    expect(monthDayText("2026-10-08")).toBe("10월 8일");
    expect(monthDayText("2026-10-08T01:00:00Z")).toBe("");
  });
});

describe("INV-G9: 카드 크리에이터 이름 글자 크기", () => {
  it("INV-G9: 8자까지는 시안 크기(정사각 68 · 가로 52), 길수록 줄이고 20자에서 가장 작다 — 모두 짝수", () => {
    expect([cardNameSize("하루", "square"), cardNameSize("하루", "wide")]).toEqual([68, 52]);
    expect([cardNameSize("가".repeat(8), "square"), cardNameSize("가".repeat(8), "wide")]).toEqual([68, 52]);
    expect([cardNameSize("가".repeat(9), "square"), cardNameSize("가".repeat(9), "wide")]).toEqual([60, 44]);
    expect([cardNameSize("가".repeat(12), "square"), cardNameSize("가".repeat(12), "wide")]).toEqual([60, 44]);
    expect([cardNameSize("가".repeat(13), "square"), cardNameSize("가".repeat(13), "wide")]).toEqual([52, 36]);
    expect([cardNameSize("가".repeat(CARD_NAME_MAX), "square"), cardNameSize("가".repeat(CARD_NAME_MAX), "wide")]).toEqual([52, 36]);
    // 글자 수는 코드 포인트로 센다(이모지 하나 = 한 글자)
    expect(cardNameSize("😀".repeat(9), "wide")).toBe(44);
  });

  it("INV-G9: 1~20자 한글 이름 「{이름}님이 남긴」이 가로 카드 왼쪽 열(296px)에서 세 줄·170px 안, 정사각 머리(692px)에서 두 줄 안에 들어간다", () => {
    // 한글 한 글자 폭은 글자 크기의 0.96배로 넉넉히 잡는다(Pretendard ExtraBold 실측은 그보다 좁다), 글자 사이 -1px
    const lines = (n: number, font: number, width: number) => Math.ceil((n + 2) / Math.floor(width / (font * 0.96 - 1)));
    for (let n = 1; n <= CARD_NAME_MAX; n++) {
      const name = "가".repeat(n);
      const wide = cardNameSize(name, "wide");
      expect([n, lines(n, wide, 296) <= 3 && lines(n, wide, 296) * wide * 1.15 <= 170]).toEqual([n, true]);
      expect([n, lines(n, cardNameSize(name, "square"), 692) <= 2]).toEqual([n, true]);
      expect(wide % 2).toBe(0);
    }
  });
});

describe("검사 문구 · 받은 상자 목록 상한", () => {
  it("INV-G3: 한 줄의 꼴 문제를 화면·서버가 같이 쓰는 문구로 — 문제가 없으면 null", () => {
    expect(replyLineMessage("가".repeat(REPLY_LINE_MAX + 1))).toBe(REPLY_INPUT_MESSAGE.tooLong);
    expect(REPLY_INPUT_MESSAGE.tooLong).toBe("한 줄은 80자까지 쓸 수 있어요.");
    expect(replyLineMessage("첫 줄" + String.fromCharCode(10) + "둘째 줄")).toBe(REPLY_INPUT_MESSAGE.forbiddenChars);
    expect(replyLineMessage("가".repeat(REPLY_LINE_MAX))).toBeNull();
    expect(replyLineMessage(null)).toBeNull();
  });

  it("INV-G10: 받은 상자 목록이 상한(DB 읽기 함수의 200개)에 닿으면 「최근 N개만」을 알린다 — 아직 답장 안 한 수는 전체를 센다", () => {
    expect(RECEIVED_BOXES_MAX).toBe(200);
    expect(receivedListCapped(199)).toBe(false);
    expect(receivedListCapped(200)).toBe(true);
    expect(receivedListCapped(0)).toBe(false);
  });
});
