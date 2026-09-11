// 근거 스펙: docs/specs/text-display-integrity.md (INV-T1 · INV-T2) ·
//            supabase/migrations/0022_text_display_integrity.sql
//
// 여기서 판정하는 것은 전부 **폼과 서버 액션을 안 지나는 쓰기**다. `사람.client` 는 공개
// 키로 로그인한 연결이고, 그 키는 브라우저 번들에도 들어가는 값이라 이 연결로 할 수 있는
// 일이 곧 「아무나 할 수 있는 일」이다. 앱의 다듬기(`formText` 의 `trim()`)는 이 경로에 없다.
//
// **네 열을 한 파일에서 본다.** 이 스펙의 내용이 「열마다 다르게 처리되던 것을 한 판정으로
// 모은다」라서, 열을 나눠 두면 다음 사람이 세 파일 중 하나만 고치고 끝낼 수 있다.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasBidiFormatting, hasControlChars, hasVisibleContent } from "@/shared/lib/text";
import {
  acceptedMember,
  admin,
  chatIdOf,
  cleanupCreatedUsers,
  createStudy,
  createUser,
  type TestUser,
} from "./helpers";

let 호스트: TestUser;
let 멤버: TestUser;
let studyId: string;
let chatId: string;

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

beforeAll(async () => {
  호스트 = await createUser("t-text-host");
  멤버 = await createUser("t-text-member");
  studyId = await createStudy(호스트.id);
  await acceptedMember(studyId, 멤버.id);
  chatId = await chatIdOf(studyId);
}, 60_000);

afterAll(async () => {
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

  it("INV-T2 (S4d): 이름과 본문에도 같은 판정이 걸린다", async () => {
    const 이름 = await 이름바꾸기(멤버, `김${RLI}하늘`);
    expect(이름.error, "서식 문자가 든 이름이 들어갔다").not.toBeNull();
    expect(이름.error!.message).toMatch(/profiles_username_no_bidi/);

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
  const 값들: readonly (readonly [string, string])[] = [
    ["보통 제목", "토익 900"],
    ["아랍어", 아랍어],
    ["히브리어", 히브리어],
    ["이모지", `${가족이모지} 스터디`],
    ["악센트(NFD)", `cafe${글자(0x301)} 모임`],
    ["제어문자 U+0007", `토익${글자(0x07)}900`],
    ["제어문자 U+0009 탭", `토익${글자(0x09)}900`],
    ["제어문자 U+000A 줄바꿈", `토익${글자(0x0a)}900`],
    ["C1 U+0085", `토익${글자(0x85)}900`],
    ["C1 U+009F", `토익${글자(0x9f)}900`],
    ["전각 공백만", 전각공백],
    ["줄바꿈 없는 공백만", 줄바꿈없는공백],
    ["폭 없는 공백만", 폭없는공백],
    ["BOM 만", BOM],
    ["단어 이음만", 단어이음],
    ["몽골 모음 구분만", 몽골모음구분],
    ["줄 구분자만", 줄구분자],
    ["ZWJ 만", ZWJ],
    ["섞인 공백만", 전각공백 + 폭없는공백],
    ["RLO 섞임", `${RLO}토익 900`],
    ["RLE 섞임", `${RLE}토익 900`],
    ["RLI 섞임", `${RLI}토익 900`],
    ["FSI 섞임", `${FSI}토익 900`],
    ["LRM 섞임", `${LRM}토익 900`],
    ["PDF 섞임", `${PDF}토익 900`],
    ["섞인 줄 구분자", `토익${줄구분자}900`],
    ["섞인 ZWJ", `토익${ZWJ}900`],
    ["섞인 폭 없는 공백", `토익${폭없는공백}900`],
  ];

  it("INV-T1·INV-T2 (S6b): 28개 값에서 두 판정이 한 건도 안 갈린다", async () => {
    const 갈린것: string[] = [];

    for (const [이름표, 값] of 값들) {
      const 앱이거부 = hasControlChars(값) || hasBidiFormatting(값) || !hasVisibleContent(값);
      const r = await 제목바꾸기(값);
      const DB가거부 = r.error !== null;

      if (앱이거부 !== DB가거부) {
        갈린것.push(
          `${이름표}: 앱=${앱이거부 ? "거부" : "통과"} · DB=${DB가거부 ? "거부" : "통과"}` +
            (r.error ? ` (${r.error.message})` : ""),
        );
      }
      if (!DB가거부) await 제목바꾸기("테스트 스터디");
    }

    expect(갈린것, "앱과 데이터베이스의 판정이 갈렸다").toEqual([]);
  });

  it("INV-T1·INV-T2 (S6b, 반대 절반): 그 목록이 양쪽 답을 다 담고 있다", async () => {
    // **「한 건도 안 갈린다」는 전부 통과여도 참이고 전부 거부여도 참이다.** 목록이 한쪽으로
    // 쏠려 있으면 위 검사는 판정 하나를 통째로 지워도 초록불이다.
    const 거부 = 값들.filter(([, v]) => hasControlChars(v) || hasBidiFormatting(v) || !hasVisibleContent(v));
    expect(거부.length).toBeGreaterThan(15);
    expect(값들.length - 거부.length).toBeGreaterThan(5);
  });
});
