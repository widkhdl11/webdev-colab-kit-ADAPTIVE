// 근거 스펙: docs/specs/text-display-integrity.md (INV-T1 · INV-T2) ·
//            supabase/migrations/0022_text_display_integrity.sql
//
// 여기서 판정하는 것은 전부 **폼과 서버 액션을 안 지나는 쓰기**다. `사람.client` 는 공개
// 키로 로그인한 연결이고, 그 키는 브라우저 번들에도 들어가는 값이라 이 연결로 할 수 있는
// 일이 곧 「아무나 할 수 있는 일」이다. 앱의 다듬기(`formText` 의 `trim()`)는 이 경로에 없다.
//
// **네 열을 한 파일에서 본다.** 이 스펙의 내용이 「열마다 다르게 처리되던 것을 한 판정으로
// 모은다」라서, 열을 나눠 두면 다음 사람이 세 파일 중 하나만 고치고 끝낼 수 있다.

import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasBidiFormatting, hasControlChars, hasVisibleContent } from "@/shared/lib/text";
import {
  acceptedMember,
  admin,
  chatIdOf,
  cleanupCreatedUsers,
  createStudy,
  createUser,
  rawClient,
  type TestUser,
} from "./helpers";

let 호스트: TestUser;
let 멤버: TestUser;
let studyId: string;
let chatId: string;
/** 제약 본문을 직접 물어보는 연결 — 카탈로그는 공개 키로 못 읽는다. */
let db: Client;

/** 이름을 **공개 키 연결로** 바꾼다. 프로필 수정 폼이 지나는 길과 같은 권한이다. */
const 이름바꾸기 = (who: TestUser, username: string) =>
  who.client.from("profiles").update({ username }).eq("id", who.id);

/** 제목을 **공개 키 연결로** 바꾼다. 0002 가 `title` 을 열 단위 갱신 권한에 넣어 뒀다. */
const 제목바꾸기 = (title: string) =>
  호스트.client.from("studies").update({ title }).eq("id", studyId);

/** 메시지를 **공개 키 연결로** 넣는다. */
const 메시지보내기 = (content: string) =>
  멤버.client.from("chat_messages").insert({ chat_id: chatId, sender_id: 멤버.id, content });

/** 알림 행을 **비밀 키로** 직접 넣는다. 이 표는 공개 키로 못 쓴다(트리거가 넣는다). */
const 알림넣기 = (title: string) =>
  admin.from("notifications").insert({
    user_id: 호스트.id,
    type: "participation_requested",
    title,
    reference_id: studyId,
  });

// ── 값 ─────────────────────────────────────────────────────────────────────
//
// **코드 포인트로 적는다 — 글자를 소스에 직접 박지 않는다.** 이 파일이 다루는 것이
// 「보이지 않는 글자」라서, 리터럴로 적으면 파일을 옮기거나 붙여 넣는 과정에 조용히
// 사라진다(2026-09-06 실측 · `features/chat/model/limits.ts` 가 같은 이유로 같은 손짓을
// 쓴다). **이 파일을 쓰면서 실제로 당했다** — 편집 도구를 한 번 지나가자 박아 둔
// 글자가 달라졌다. 사라져도 검사는 초록불이 되고, 그때 이 파일은 「빈 문자열이 거부된다」를 재고 있다.
//
// 이름을 붙여 두는 것은 빨간불 메시지에서 어느 부류인지 바로 읽히게 하기 위해서다.
const 글자 = (cp: number) => String.fromCodePoint(cp);

const 전각공백 = 글자(0x3000);
const 줄바꿈없는공백 = 글자(0x00a0);
const 폭없는공백 = 글자(0x200b);
const BOM = 글자(0xfeff);
const 단어이음 = 글자(0x2060);
const 몽골모음구분 = 글자(0x180e);
const 줄구분자 = 글자(0x2028);
const ZWJ = 글자(0x200d);
const 가족이모지 = `${글자(0x1f468)}${ZWJ}${글자(0x1f469)}${ZWJ}${글자(0x1f467)}`;
const RLO = 글자(0x202e);
const RLE = 글자(0x202b);
const RLI = 글자(0x2067);
const FSI = 글자(0x2068);
const LRM = 글자(0x200e);
const PDF = 글자(0x202c);
// 오른쪽-왼쪽 **글자** — 서식 문자가 하나도 없다. 막히면 안 되는 쪽이다.
const 아랍어 = "دراسة";
const 히브리어 = "לימוד";

/**
 * 0022 의 지우는 집합에 든 글자들. **U+061C 는 여기 없다** — 그 한 자는 지우는 집합과
 * 금지 목록에 **둘 다** 들어 있어서, 단독으로 넣으면 어느 제약이 막았는지가
 * 데이터베이스의 판정 순서에 달린다. 그 한 자는 아래 서식 문자 검사에서 따로 본다.
 *
 * **부류를 같이 적는 이유가 이 목록에서 제일 중요한 부분이다.**
 *
 * - `공백류` 는 0020·0021 의 옛 제약(`btrim` · `[[:space:]]|BOM`)도 같이 문다. 게다가
 *   `[[:space:]]` 가 무엇을 담는지는 **그 데이터베이스의 ctype 이 정하므로** 배포처마다
 *   다를 수 있다. 그래서 이 부류는 「어느 제약이 막았나」를 못 박지 않는다.
 * - `폭없는` 은 **어느 옛 제약에도 안 걸린다.** 0022 의 `*_visible` 이 막는 것이 확실하고,
 *   그 판정이 로케일에 안 달렸다. 그래서 **네 열 모두에서 `*_visible` 이 막아야 한다**고
 *   못 박을 수 있다 — 이것이 「지우는 집합을 0021 수준으로 되돌리는」 변이를 붙드는
 *   유일한 값 검사다(2026-09-11 test-auditor: 개수 임계값으로는 안 잡힌다. 좁혀도 옛
 *   제약이 부분집합을 대신 물어서 수가 그대로다).
 */
const 보이지않는글자들: readonly (readonly [string, number, "공백류" | "폭없는"])[] = [
  ["U+0020 보통 공백", 0x20, "공백류"],
  ["U+00A0 줄바꿈 없는 공백", 0x00a0, "공백류"],
  ["U+1680 오검 칸", 0x1680, "공백류"],
  ["U+2005 네 분의 일 공백", 0x2005, "공백류"],
  ["U+2007 숫자 공백", 0x2007, "공백류"],
  ["U+2028 줄 구분자", 0x2028, "공백류"],
  ["U+2029 문단 구분자", 0x2029, "공백류"],
  ["U+202F 좁은 줄바꿈 없는 공백", 0x202f, "공백류"],
  ["U+205F 수식 중간 공백", 0x205f, "공백류"],
  ["U+3000 전각 공백", 0x3000, "공백류"],
  ["U+FEFF BOM", 0xfeff, "공백류"], // 0021 이 이것만 따로 적어 뒀다
  ["U+180E 몽골 모음 구분", 0x180e, "폭없는"],
  ["U+200B 폭 없는 공백", 0x200b, "폭없는"],
  ["U+200C 폭 없는 비이음", 0x200c, "폭없는"],
  ["U+200D ZWJ", 0x200d, "폭없는"],
  ["U+2060 단어 이음", 0x2060, "폭없는"],
  ["U+2061 보이지 않는 함수 적용", 0x2061, "폭없는"],
  ["U+2062 보이지 않는 곱", 0x2062, "폭없는"],
  ["U+2063 보이지 않는 구분", 0x2063, "폭없는"],
  ["U+2064 보이지 않는 덧셈", 0x2064, "폭없는"],
  ["U+2800 점자 빈 칸", 0x2800, "폭없는"],
  ["U+115F 초성 채움", 0x115f, "폭없는"],
  ["U+1160 중성 채움", 0x1160, "폭없는"],
  ["U+3164 한글 채움", 0x3164, "폭없는"],
  ["U+FFA0 반각 한글 채움", 0xffa0, "폭없는"],
  ["U+E0020 태그 공백", 0xe0020, "폭없는"],
];

/** 유니코드가 `Bidi_Control=Yes` 로 정한 **열두 자 전부**. */
const 양방향서식전체: readonly number[] = [
  0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069,
];

/**
 * 제어문자 — 이 스펙의 비범위이고 0015·0020·0021 의 옛 제약이 맡는다. 앱과 데이터베이스의
 * 범위 대조(S6b)에는 **들어가야 한다**: 실제로 갈라졌던 자리가 여기(C1 구역)였다.
 */
const 제어문자들: readonly number[] = [0x07, 0x09, 0x0a, 0x1f, 0x7f, 0x85, 0x9f];

beforeAll(async () => {
  db = await rawClient();
  호스트 = await createUser("t-text-host");
  멤버 = await createUser("t-text-member");
  studyId = await createStudy(호스트.id);
  await acceptedMember(studyId, 멤버.id);
  chatId = await chatIdOf(studyId);
}, 60_000);

afterAll(async () => {
  await db.end();
  await cleanupCreatedUsers();
});

describe("INV-T1: 저장되는 글자에는 보이는 내용이 하나는 있어야 한다", () => {
  it("INV-T1 (S1·S1b·S1c): 보이지 않는 글자만으로 된 이름은 안 들어간다", async () => {
    // 다섯이 서로 다른 이유로 지금까지 통과하던 값이다. 한 덩어리로 도는 이유는
    // **지우는 집합이 하나**라서다 — 하나만 걸리고 넷이 새면 그 집합이 틀린 것이다.
    for (const [이름표, 값] of [
      ["U+3000 전각 공백", 전각공백],
      ["U+00A0 줄바꿈 없는 공백", 줄바꿈없는공백],
      ["U+200B 폭 없는 공백", 폭없는공백],
      ["U+FEFF BOM", BOM],
      ["U+2060 단어 이음", 단어이음],
      ["U+180E 몽골 모음 구분", 몽골모음구분],
      ["U+2028 줄 구분자", 줄구분자],
      ["U+200D ZWJ 단독", ZWJ],
      ["섞어 쓴 것", 전각공백 + 폭없는공백 + BOM],
    ] as const) {
      const r = await 이름바꾸기(호스트, 값);
      expect(r.error, `${이름표} 로만 된 이름이 들어갔다`).not.toBeNull();
      expect(r.error!.message, 이름표).toMatch(/profiles_username_visible/);
    }
  });

  it("INV-T1 (S1d·S1e): 보통 이름과 이모지가 든 이름은 들어간다", async () => {
    // **반대 절반이 없으면 제약을 「항상 거부」로 바꿔도 위 검사가 전부 통과한다.**
    // 그리고 `가족이모지` 는 ZWJ 를 통째로 금지하는 구현을 여기서 빨간불로 만든다 —
    // 그 구현은 위 검사를 전부 통과하면서 정상 메시지를 막는다.
    for (const 값 of ["김하늘", `${가족이모지} 우리`, `이름${폭없는공백}`, 아랍어, 히브리어]) {
      const r = await 이름바꾸기(호스트, 값);
      expect(r.error, `정상 이름이 거부됐다: ${JSON.stringify(값)}`).toBeNull();
    }
    await 이름바꾸기(호스트, "t-text-host");
  });

  it("INV-T1 (S2·S2b): 제목에도 같은 판정이 걸린다", async () => {
    for (const [이름표, 값] of [
      ["U+3000 전각 공백", 전각공백],
      ["U+200B 폭 없는 공백", 폭없는공백],
      ["U+180E 몽골 모음 구분", 몽골모음구분],
    ] as const) {
      const r = await 제목바꾸기(값);
      expect(r.error, `${이름표} 로만 된 제목이 들어갔다`).not.toBeNull();
      expect(r.error!.message, 이름표).toMatch(/studies_title_visible/);
    }

    const 정상 = await 제목바꾸기("토익 900");
    expect(정상.error, "정상 제목이 거부됐다").toBeNull();
  });

  it("INV-T1 (S3·S3b): 본문의 판정이 폭 없는 글자까지 넓어졌다", async () => {
    // **0021 의 판정은 이 셋을 통과시켰다** — `[[:space:]]` 에 안 들어가기 때문이다.
    // 그 값들은 빈 말풍선이 되고, 채팅방 목록에서 「아직 대화가 없습니다」와 구별되지 않는다.
    for (const [이름표, 값] of [
      ["U+200B 폭 없는 공백", 폭없는공백],
      ["U+2060 단어 이음", 단어이음],
      ["U+180E 몽골 모음 구분", 몽골모음구분],
      ["U+200D ZWJ 단독", ZWJ],
    ] as const) {
      const r = await 메시지보내기(값);
      expect(r.error, `${이름표} 로만 된 본문이 들어갔다`).not.toBeNull();
      expect(r.error!.message, 이름표).toMatch(/chat_messages_content_visible/);
    }

    const 이모지 = await 메시지보내기(`${가족이모지} 내일 봬요`);
    expect(이모지.error, "가족 이모지가 든 메시지가 거부됐다 — ZWJ 를 통째로 막고 있다").toBeNull();
  });

  it("INV-T1 (S5): 알림 행의 제목에도 걸린다", async () => {
    const r = await 알림넣기(전각공백);
    expect(r.error, "보이는 내용이 없는 제목이 알림 행에 들어갔다").not.toBeNull();
    expect(r.error!.message).toMatch(/notifications_title_visible/);

    const 정상 = await 알림넣기("토익 900");
    expect(정상.error, "정상 제목이 거부됐다").toBeNull();
  });
});

describe("INV-T2: 양방향 서식 문자는 저장되지 않는다", () => {
  it("INV-T2 (S4·S4b): 제목에 든 서식 문자는 부류 전체가 막힌다", async () => {
    // **한글 제목에서 화면을 실제로 깨는 것은 RLO 하나뿐이다**(2026-09-11 실측).
    // 나머지를 여기서 같이 미는 이유가 스펙의 근거 ③ 이다 — 제목이 히브리어면
    // RLE·RLI·FSI 도 똑같이 깼고, 어느 쪽이 올지는 제품이 안 정한다.
    // 이 검사가 없으면 「안 깨는 것은 열어 두자」는 되돌림을 아무도 못 막는다.
    for (const [이름표, 값] of [
      ["U+202E RLO", RLO],
      ["U+202B RLE", RLE],
      ["U+2067 RLI", RLI],
      ["U+2068 FSI", FSI],
      ["U+200E LRM", LRM],
      ["U+202C PDF", PDF],
    ] as const) {
      const r = await 제목바꾸기(`${값}토익 900`);
      expect(r.error, `${이름표} 가 든 제목이 들어갔다`).not.toBeNull();
      expect(r.error!.message, 이름표).toMatch(/studies_title_no_bidi/);
    }
  });

  it("INV-T2 (S4c): 오른쪽-왼쪽 글자 자체는 안 막는다", async () => {
    // 실측에서 제어 문자 없는 아랍어·히브리어 제목은 낫표 경계를 안 깼다.
    // **이 검사가 없으면 「오른쪽-왼쪽 글자를 다 막는다」는 구현이 위 검사를 통과한다.**
    for (const 값 of [아랍어, 히브리어, `${아랍어} 900`]) {
      const r = await 제목바꾸기(값);
      expect(r.error, `정상 제목이 거부됐다: ${값}`).toBeNull();
    }
    await 제목바꾸기("테스트 스터디");
  });

  // **갈래를 한 검사에 묶지 않는다.** 묶으면 앞 단언이 실패할 때 뒤 갈래를 **아예 안 재고**,
  // 변이 판정은 「잡혔다」가 된다 — 그러면 뒤 갈래는 아무도 안 붙드는데 숫자는 만점이다
  // (`chat-message-integrity.md` 가 S3/S3b 에서 같은 이유로 이미 쪼개 뒀다 ·
  // 2026-09-11 test-auditor).
  it("INV-T2 (S4d, 이름): 이름에도 같은 판정이 걸린다", async () => {
    const 이름 = await 이름바꾸기(멤버, `김${RLI}하늘`);
    expect(이름.error, "서식 문자가 든 이름이 들어갔다").not.toBeNull();
    expect(이름.error!.message).toMatch(/profiles_username_no_bidi/);
  });

  it("INV-T2 (S4d, 본문): 본문에도 같은 판정이 걸린다", async () => {
    const 본문 = await 메시지보내기(`${RLO}내일 봬요`);
    expect(본문.error, "서식 문자가 든 본문이 들어갔다").not.toBeNull();
    expect(본문.error!.message).toMatch(/chat_messages_content_no_bidi/);
  });

  it("INV-T2 (S5): 알림 행의 제목에도 걸린다", async () => {
    const r = await 알림넣기(`${RLO}토익 900`);
    expect(r.error, "서식 문자가 든 제목이 알림 행에 들어갔다").not.toBeNull();
    expect(r.error!.message).toMatch(/notifications_title_no_bidi/);
  });
});

describe("INV-T2 (S6b): 앱의 판정과 데이터베이스 제약이 같은 값에서 같은 답을 낸다", () => {
  // **이 검사가 이 파일에서 제일 중요하다.** 둘의 범위가 갈라지면 그 틈으로 들어간 값은
  // 데이터베이스가 23514 로 거부하고, `dbErrorMessage` 가 영어 원문을 덮어
  // 「잠시 뒤 다시 시도해 주세요」를 돌려준다 — **다시 시도해도 절대 성공하지 않는다.**
  //
  // 2026-09-11 까지 실제로 갈라져 있었다: 이름 쪽 앱 판정만 C1 구역(U+0080–9F)을 안 봤고,
  // 제목 경로에는 판정이 **아예 없었다**. 둘 다 앱 단독 검사로는 안 잡힌다 —
  // 데이터베이스가 무엇을 거부하는지 물어봐야 보인다.
  // **목록을 손으로 두 번 적지 않는다.** 2026-09-11 까지 이 목록은 아래 행렬이 데이터베이스에
  // 먹이는 스물여섯과 **다른 목록**이었다. 둘 다에 없는 부류가 다섯이었고(U+115F·U+1160·
  // U+FFA0·U+2061–2064·태그 문자), 그 다섯은 **데이터베이스 쪽만 재고 앱 쪽은 아무도 안
  // 쟀다** — `text.ts` 의 지우는 집합에서 그 한 줄을 지워도 유닛도 통합도 전부 초록불이었다
  // (test-auditor). 그래서 같은 목록에서 파생시킨다: 행렬에 글자를 더하면 앱 대조도 자동으로
  // 따라온다.
  const 값들: readonly (readonly [string, string])[] = [
    // ① 통과해야 하는 값 — 반대 절반이 없으면 「전부 거부」로 바꿔도 아래 대조가 참이다
    ["보통 제목", "토익 900"],
    ["아랍어", 아랍어],
    ["히브리어", 히브리어],
    ["이모지", `${가족이모지} 스터디`],
    ["악센트(NFD)", `cafe${글자(0x301)} 모임`],
    ["섞인 줄 구분자", `토익${줄구분자}900`],
    ["섞인 ZWJ", `토익${ZWJ}900`],
    ["섞인 폭 없는 공백", `토익${폭없는공백}900`],
    // ② 제어문자 — 이 스펙의 비범위지만 **실제로 갈라졌던 자리가 여기였다**(C1 구역)
    ...제어문자들.map(
      (cp) => [`제어문자 U+${cp.toString(16).toUpperCase().padStart(4, "0")}`, `토익${글자(cp)}900`] as const,
    ),
    // ③ 보이지 않는 글자 스물여섯 — 행렬이 데이터베이스에 먹이는 것과 **같은 목록**이다
    ...보이지않는글자들.map(([이름표, cp]) => [`${이름표} 만`, 글자(cp)] as const),
    // ④ 양방향 서식 문자 열두 자 — U+061C 를 포함한 부류 전체
    ...양방향서식전체.map(
      (cp) => [`U+${cp.toString(16).toUpperCase().padStart(4, "0")} 섞임`, `${글자(cp)}토익 900`] as const,
    ),
    ["섞인 공백만", 전각공백 + 폭없는공백],
  ];

  /** 앱이 이 값을 거부하나 — 세 판정을 합친 것. 세 자리가 전부 같은 셋을 본다. */
  const 앱이거부하나 = (v: string) =>
    hasControlChars(v) || hasBidiFormatting(v) || !hasVisibleContent(v);

  /**
   * 대조를 **두 경로로** 돌린다.
   *
   * **2026-09-11 까지 이 대조는 `studies.title` 한 열로만 갔는데, 실제로 갈라졌던 것은
   * 이름 경로였다**(C1 구역을 앱만 안 봤다). 갈라짐이 난 자리를 안 재는 대조는 그 갈라짐이
   * 다시 나도 초록불이다 (2026-09-11 test-auditor).
   */
  const 경로들 = [
    {
      이름: "studies.title",
      쓴다: (v: string) => 제목바꾸기(v),
      되돌린다: () => 제목바꾸기("테스트 스터디"),
    },
    {
      이름: "profiles.username",
      쓴다: (v: string) => 이름바꾸기(호스트, v),
      되돌린다: () => 이름바꾸기(호스트, "t-text-host"),
    },
  ] as const;

  it("INV-T1·INV-T2 (S6b): 값 목록 전부에서 두 판정이 한 건도 안 갈린다 — 경로 둘에서", async () => {
    const 갈린것: string[] = [];

    for (const 경로 of 경로들) {
      for (const [이름표, 값] of 값들) {
        const 앱이거부 = 앱이거부하나(값);
        const r = await 경로.쓴다(값);
        const DB가거부 = r.error !== null;

        if (앱이거부 !== DB가거부) {
          갈린것.push(
            `${경로.이름} ← ${이름표}: 앱=${앱이거부 ? "거부" : "통과"} · DB=${DB가거부 ? "거부" : "통과"}` +
              (r.error ? ` (${r.error.message})` : ""),
          );
        }
        if (!DB가거부) await 경로.되돌린다();
      }
    }

    expect(갈린것, "앱과 데이터베이스의 판정이 갈렸다").toEqual([]);
  });

  it("INV-T1·INV-T2 (S6b, 반대 절반): 목록이 판정 **셋을 따로** 붙들 만큼 담고 있다", async () => {
    // **「한 건도 안 갈린다」는 전부 통과여도 참이고 전부 거부여도 참이다.** 그래서 예전에는
    // 「거부 15건 이상 · 통과 5건 이상」을 셌는데, **그 수는 판정 셋을 뭉쳐서 센다** —
    // 서식 문자 값 여섯 줄을 통째로 지워도 임계값을 통과했다(2026-09-11 test-auditor).
    //
    // 그래서 **어느 판정이 혼자 막았나**로 나눠 센다. 한 부류를 목록에서 지우면 그 부류의
    // 수가 0이 되어 여기서 빨간불이 난다.
    const 오직 = (판정: (v: string) => boolean, 나머지: readonly ((v: string) => boolean)[]) =>
      값들.filter(([, v]) => 판정(v) && !나머지.some((f) => f(v)));

    const 보이지않아서 = 오직((v) => !hasVisibleContent(v), [hasControlChars, hasBidiFormatting]);
    const 서식문자라서 = 오직(hasBidiFormatting, [hasControlChars, (v) => !hasVisibleContent(v)]);
    const 제어문자라서 = 오직(hasControlChars, [hasBidiFormatting, (v) => !hasVisibleContent(v)]);
    const 통과 = 값들.filter(([, v]) => !앱이거부하나(v));

    expect(보이지않아서.length, "「보이는 내용이 없다」로만 막히는 값이 모자라다").toBeGreaterThanOrEqual(8);
    expect(서식문자라서.length, "「서식 문자」로만 막히는 값이 모자라다").toBeGreaterThanOrEqual(6);
    expect(제어문자라서.length, "「제어문자」로만 막히는 값이 모자라다").toBeGreaterThanOrEqual(4);
    expect(통과.length, "통과해야 하는 값이 모자라다").toBeGreaterThanOrEqual(6);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 네 열이 **같은** 판정을 받는다 (INV-T1 · INV-T2)
// ═══════════════════════════════════════════════════════════════════════════
//
// **위 검사들은 열마다 값을 몇 개씩만 넣는다.** 이름은 아홉, 제목은 셋, 본문은 넷,
// 알림은 하나였다. 그래서 `profiles_username_no_bidi` 를 U+2066–2069 만 남게 좁히거나
// `notifications_title_visible` 의 지우는 집합을 0021 수준으로 되돌려도 전부 초록불이었다
// (2026-09-11 test-auditor).
//
// **그런데 이 스펙의 문제 진술이 「같은 종류의 값이 열마다 다르게 처리된다」이다.** 그
// 재발을 막으려면 **같은 값 목록을 네 열에 다 먹여야 한다** — 한 열만 좁히는 변이는
// 열별로 값이 다른 검사로는 원리상 안 잡힌다.

/** 한 열에 값을 넣어 보고, 실패하면 어느 제약이 막았는지 읽는 손잡이. */
type 쓰는자리 = {
  readonly 이름: string;
  // `PromiseLike` 다 — 질의 만들개는 `then` 만 있고 `catch`·`finally` 가 없다.
  readonly 쓴다: (값: string) => PromiseLike<{ error: { message: string } | null }>;
  /** 통과한 값을 남겨 두면 다음 검사의 전제가 달라진다 — 정상값으로 되돌린다. */
  readonly 되돌린다: () => PromiseLike<unknown>;
  readonly visible제약: string;
  readonly bidi제약: string;
  /**
   * **이 열에서 같은 값을 먼저 막을 수 있는 옛 제약들.** 0022 가 일부러 안 뗀 것들이다
   * (`studies_title_length` 의 `btrim <> ''` · `chat_messages_content_length` 의
   * `[[:space:]]|BOM` 지우기). 둘 다 0022 가 보는 집합의 **부분집합**이라 같은 값을 둘이
   * 막을 뿐 새는 자리는 안 생기는데, **어느 쪽이 먼저 걸리는지는 데이터베이스가 정한다.**
   * 여기 안 적으면 그 값들이 「다른 제약이 막았다」로 빨간불이 난다 — 실제로는 막힌 건데.
   */
  readonly 겹치는옛제약: readonly string[];
  /** 이 열이 받아들여야 하는 정상값. 길이 상한이 열마다 달라 따로 준다. */
  readonly 정상: readonly string[];
};

const 네열 = (): readonly 쓰는자리[] => [
  {
    이름: "profiles.username",
    쓴다: (값) => 이름바꾸기(호스트, 값),
    되돌린다: () => 이름바꾸기(호스트, "t-text-host"),
    visible제약: "profiles_username_visible",
    bidi제약: "profiles_username_no_bidi",
    겹치는옛제약: [],
    정상: ["김하늘", 아랍어, 히브리어, `${가족이모지} 우리`],
  },
  {
    이름: "studies.title",
    쓴다: (값) => 제목바꾸기(값),
    되돌린다: () => 제목바꾸기("테스트 스터디"),
    visible제약: "studies_title_visible",
    bidi제약: "studies_title_no_bidi",
    // `btrim(title) <> ''` — U+0020 하나만 자르므로 보통 공백에서만 겹친다.
    겹치는옛제약: ["studies_title_length"],
    정상: ["토익 900", 아랍어, 히브리어, `${가족이모지} 가족 모임`],
  },
  {
    이름: "chat_messages.content",
    쓴다: (값) => 메시지보내기(값),
    // 삽입이라 되돌릴 것이 없다 — 통과한 값은 행 하나로 남고 다음 검사의 전제를 안 바꾼다.
    되돌린다: async () => undefined,
    visible제약: "chat_messages_content_visible",
    bidi제약: "chat_messages_content_no_bidi",
    // 0021 의 `regexp_replace([[:space:]]|BOM)` — 공백류와 BOM 에서 겹친다.
    겹치는옛제약: ["chat_messages_content_length"],
    정상: ["내일 봬요", 아랍어, 히브리어, `${가족이모지} 내일 봬요`],
  },
  {
    이름: "notifications.title",
    쓴다: (값) => 알림넣기(값),
    되돌린다: async () => undefined,
    visible제약: "notifications_title_visible",
    bidi제약: "notifications_title_no_bidi",
    겹치는옛제약: ["notifications_title_length"],
    정상: ["토익 900", 아랍어, 히브리어, `${가족이모지} 가족 모임`],
  },
];

describe("네 열이 같은 값 목록에서 같은 답을 낸다", () => {
  it("INV-T1: 보이지 않는 글자 스물여섯이 네 열에서 전부 막힌다", async () => {
    // **한 열만 좁히는 변이를 붙드는 것이 이 검사다.** 열마다 값이 다르면
    // `notifications` 를 0021 수준으로 되돌려도 아무도 안 깨진다 — 그 열은 U+3000 하나로만
    // 재고 있었고, U+3000 은 0021 의 `[[:space:]]` 에도 들어 있다.
    //
    // **「몇 개가 막혔나」로 세지 않는다.** 0022 를 0021 수준으로 좁혀도 옛 제약이 공백류를
    // 대신 물어서 **막힌 개수는 거의 그대로**다(2026-09-11 test-auditor). 그래서 부류로
    // 나눠서, **폭 없는 글자는 `*_visible` 이 막았다고 못 박는다** — 그 부류는 어느 옛
    // 제약에도 안 걸리므로 좁히는 순간 아무것도 안 막게 된다.
    const 샌것: string[] = [];

    for (const 자리 of 네열()) {
      for (const [이름표, cp, 부류] of 보이지않는글자들) {
        const r = await 자리.쓴다(String.fromCodePoint(cp));

        if (r.error === null) {
          샌것.push(`${자리.이름} ← ${이름표} 가 들어갔다`);
          await 자리.되돌린다();
          continue;
        }
        if (r.error.message.includes(자리.visible제약)) continue;

        if (부류 === "폭없는") {
          // 여기 오면 「막히긴 했는데 0022 가 막은 게 아니다」다. 폭 없는 글자를 무는
          // 옛 제약은 없으므로, 이것은 판정이 다른 자리로 옮겨 갔다는 뜻이다.
          샌것.push(
            `${자리.이름} ← ${이름표}: ${자리.visible제약} 이 아니라 다른 제약이 막았다` +
              ` (${r.error.message})`,
          );
        } else if (!자리.겹치는옛제약.some((c) => r.error!.message.includes(c))) {
          샌것.push(`${자리.이름} ← ${이름표}: 뜻밖의 제약이 막았다 (${r.error.message})`);
        }
      }
    }

    expect(샌것, "보이지 않는 글자가 어느 열에선가 통과했다").toEqual([]);

    // 목록이 한쪽으로 쏠리면 위 판정이 무뎌진다 — 부류 둘이 다 있어야 한다.
    const 폭없는수 = 보이지않는글자들.filter(([, , 부류]) => 부류 === "폭없는").length;
    expect(폭없는수, "폭 없는 글자가 목록에서 줄었다 — 이 검사의 힘이 거기서 나온다").toBeGreaterThanOrEqual(15);
    expect(보이지않는글자들.length - 폭없는수, "공백류가 목록에서 줄었다").toBeGreaterThanOrEqual(10);
  });

  it("INV-T2: 양방향 서식 문자 열두 자가 네 열에서 전부 막힌다", async () => {
    // **「부류 전체를 막는다」가 네 열에 다 걸려 있나**를 여기서 본다. 지금까지는 제목
    // 한 열만 여섯 자를 재고, 이름은 U+2067 하나 · 본문은 U+202E 하나 · 알림은
    // U+202E 하나였다. 그래서 이름 제약을 U+2066–2069 만 남게 좁혀도 초록불이었다.
    const 샌것: string[] = [];

    for (const 자리 of 네열()) {
      for (const cp of 양방향서식전체) {
        const 이름표 = `U+${cp.toString(16).toUpperCase()}`;
        const r = await 자리.쓴다(`${String.fromCodePoint(cp)}토익 900`);
        if (r.error === null) {
          샌것.push(`${자리.이름} ← ${이름표} 가 들어갔다`);
          await 자리.되돌린다();
        } else if (!r.error.message.includes(자리.bidi제약)) {
          샌것.push(`${자리.이름} ← ${이름표}: 다른 제약이 막았다 (${r.error.message})`);
        }
      }
    }

    expect(샌것, "서식 문자가 어느 열에선가 통과했다").toEqual([]);
  });

  it("INV-T1·T2 (반대 절반): 네 열이 정상값을 그대로 받는다", async () => {
    // **이것이 없으면 위 둘은 제약을 「항상 거부」로 바꿔도 초록불이다.** 오른쪽-왼쪽
    // 글자와 가족 이모지가 목록에 있는 이유는 그 둘이 서로 다른 잘못된 구현을 잡기
    // 때문이다 — 앞은 「방향 글자를 다 막는다」를, 뒤는 「ZWJ 를 다 막는다」를.
    const 막힌것: string[] = [];

    for (const 자리 of 네열()) {
      for (const 값 of 자리.정상) {
        const r = await 자리.쓴다(값);
        if (r.error !== null) 막힌것.push(`${자리.이름} ← ${JSON.stringify(값)}: ${r.error.message}`);
      }
      await 자리.되돌린다();
    }

    expect(막힌것, "정상값이 어느 열에선가 거부됐다").toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 네 열의 제약 **본문**이 같은 글자인가 (INV-T1 · INV-T2)
// ═══════════════════════════════════════════════════════════════════════════
//
// 위 검사는 값을 넣어 보고 답을 비교한다. 이것은 **제약의 글자 자체**를 비교한다.
// 값으로 재는 검사는 내가 고른 값만큼만 보지만, 본문 대조는 **내가 안 고른 값까지**
// 같다는 것을 한 번에 말한다 — 한 열만 좁히는 변이는 값 하나를 안 골라도 여기서 잡힌다.
//
// 이 스펙의 문제 진술이 「같은 종류의 값이 열마다 다르게 처리된다」이므로, 그 재발을
// 막는 검사가 있어야 한다(2026-09-11 test-auditor).

describe("INV-T1·INV-T2: 네 열의 제약 본문이 열 이름만 빼고 같다", () => {
  const 열들 = [
    ["profiles", "username"],
    ["studies", "title"],
    ["chat_messages", "content"],
    ["notifications", "title"],
  ] as const;

  /**
   * 본문에 든 `chr(N)` 의 숫자를 **중복 없이 오름차순으로** 뽑는다.
   *
   * 문자열 전체를 글자로 대 보지 않는 이유는 `pg_get_constraintdef` 의 괄호·공백 모양이
   * Postgres 판마다 달라질 수 있어서다. 이 스펙이 정하는 것은 **어느 글자를 보느냐**이고,
   * 그 내용은 이 숫자 집합에 다 들어 있다.
   */
  const chr숫자들 = (def: string) =>
    [...new Set([...def.matchAll(/chr\((\d+)\)/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);

  /** 제약 본문에서 열 이름을 지운다 — 남는 것이 같아야 판정이 같다. */
  const 열이름지우기 = (def: string, 열: string) =>
    def.replace(new RegExp(`\\b${열}\\b`, "g"), "<열>");

  async function 본문(제약: string): Promise<string> {
    const r = await db.query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint where conname = $1`,
      [제약],
    );
    // 없으면 빈 문자열이 아니라 던진다 — 빈 문자열끼리는 서로 같아서, 제약 넷을 전부
    // 떼어도 아래 단언이 통과한다.
    if (r.rows.length !== 1) throw new Error(`제약 ${제약} 을 못 찾았다 (${r.rows.length}건)`);
    return r.rows[0].def;
  }

  it("INV-T1: `*_visible` 넷의 지우는 집합이 같은 글자다", async () => {
    // **하나씩 묻는다.** 한 연결에 질의를 겹쳐 던지면 pg 가 경고를 낸다(다음 판에서는
    // 아예 거절한다) — 그리고 여기서 빠를 일이 없다.
    const 본문들: (readonly [string, string])[] = [];
    for (const [표, 열] of 열들) {
      본문들.push([`${표}.${열}`, 열이름지우기(await 본문(`${표}_${열}_visible`), 열)] as const);
    }

    // 첫 것을 기준으로 나머지 셋을 맞춘다. 어긋난 열 이름이 빨간불에 뜨게 이름을 같이 낸다.
    const [기준이름, 기준] = 본문들[0];
    for (const [이름, def] of 본문들.slice(1)) {
      expect(def, `${이름} 의 지우는 집합이 ${기준이름} 과 다르다`).toBe(기준);
    }

    // **넷을 서로만 대 보면 「넷을 똑같이 고치는」 diff 가 통과한다**(2026-09-11
    // test-auditor). 네 곳에서 같이 `chr(160)·chr(8199)·chr(8239)` 를 지우면 로컬에서는
    // `[[:space:]]` 가 대신 물어 값 검사도 조용하고 상대 대조도 초록불이다 — 0022 가
    // 「배포처에서도 걸린다는 근거가 없어서 명시한다」고 적은 그 방벽이 통째로 사라진다.
    //
    // 그래서 **절대 기준**을 하나 더 둔다: 본문에 든 `chr(N)` 의 집합이 스펙·0022 가 정한
    // 것과 정확히 같아야 한다. 여기 적힌 숫자가 0022 의 지우는 집합 그대로다.
    expect(chr숫자들(기준), `${기준이름} 의 지우는 집합이 0022 가 정한 것과 다르다`).toEqual([
      160, // U+00A0 줄바꿈 없는 공백 — 로케일이 [[:space:]] 에서 뺄 수 있어 명시한다
      1564, // U+061C 아랍 문자 마크
      4447, // U+115F 초성 채움
      4448, // U+1160 중성 채움
      6158, // U+180E 몽골 모음 구분 — 유니코드 6.3 에서 Zs 에서 Cf 로 옮겨 갔다
      8199, // U+2007 숫자 공백 — 로케일 사정이 U+00A0 과 같다
      8203, // U+200B 폭 없는 공백 (– 8205 ZWJ)
      8205, // U+200D ZWJ
      8239, // U+202F 좁은 줄바꿈 없는 공백 — 로케일 사정이 U+00A0 과 같다
      8288, // U+2060 단어 이음 (– 8292 보이지 않는 덧셈)
      8292, // U+2064 보이지 않는 덧셈
      10240, // U+2800 점자 빈 칸
      12644, // U+3164 한글 채움 — 폭 14px 로 U+3000 과 같다. 「빈 닉네임」의 단골이다
      65279, // U+FEFF BOM
      65440, // U+FFA0 반각 한글 채움
      917504, // U+E0000 태그 문자 시작
      917631, // U+E007F 태그 문자 끝 — 이 끝을 줄이는 변이가 값 검사로는 안 잡힌다
    ]);

    // 문자 부류 이름은 `chr()` 이 아니라 리터럴이라 위 집합에 안 잡힌다. 따로 본다.
    expect(기준, `${기준이름} 에 [[:space:]] 가 없다`).toContain("[[:space:]]");
  });

  it("INV-T2: `*_no_bidi` 넷의 금지 목록이 같은 글자다", async () => {
    // **하나씩 묻는다.** 한 연결에 질의를 겹쳐 던지면 pg 가 경고를 낸다(다음 판에서는
    // 아예 거절한다) — 그리고 여기서 빠를 일이 없다.
    const 본문들: (readonly [string, string])[] = [];
    for (const [표, 열] of 열들) {
      본문들.push([`${표}.${열}`, 열이름지우기(await 본문(`${표}_${열}_no_bidi`), 열)] as const);
    }

    const [기준이름, 기준] = 본문들[0];
    for (const [이름, def] of 본문들.slice(1)) {
      expect(def, `${이름} 의 금지 목록이 ${기준이름} 과 다르다`).toBe(기준);
    }

    // 상대 대조와 같은 이유로 **절대 기준**을 둔다 — 넷을 똑같이 좁히는 diff 는 서로
    // 대 보는 것만으로는 안 잡힌다. 여기 적힌 다섯 숫자가 부류 열두 자를 범위로 적은 것이다.
    expect(chr숫자들(기준), `${기준이름} 의 금지 목록이 0022 가 정한 것과 다르다`).toEqual([
      1564, // U+061C ALM — 빠뜨렸다가 넣은 한 자다(제어문자도 공백도 아니라 다른 판정에도 안 걸린다)
      8206, // U+200E LRM
      8207, // U+200F RLM
      8234, // U+202A LRE (– 8238 RLO)
      8238, // U+202E RLO
      8294, // U+2066 LRI (– 8297 PDI)
      8297, // U+2069 PDI
    ]);

    // ZWJ(chr(8205))는 **있으면 안 된다** — 가족 이모지가 그것으로 이어진다.
    // 위 집합 단언이 이미 막지만, 빨간불 메시지가 이유를 말하게 한 줄 남긴다.
    expect(기준, `${기준이름} 의 금지 목록에 ZWJ 가 들어갔다 — 가족 이모지가 막힌다`).not.toContain(
      "chr(8205)",
    );
  });
});
