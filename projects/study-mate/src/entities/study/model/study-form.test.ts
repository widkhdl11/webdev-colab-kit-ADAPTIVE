/**
 * 폼의 열한 칸을 읽는 함수. **개설과 수정이 같은 이 함수를 부르므로** 여기 붙는 검사가
 * 두 화면 몫이다 — 지금까지는 개설 액션 검사가 이 규칙들을 곁다리로 지나고 있었고,
 * 날짜 셋의 모양은 아무도 안 봤다(2026-09-07 security-reviewer).
 */
import { describe, expect, it } from "vitest";
import { readStudyFields } from "./study-form";

function 폼(values: Record<string, string> = {}): FormData {
  const form = new FormData();
  const 기본 = {
    title: "새벽 토익반",
    description: "화목 6시에 모입니다",
    categoryId: "language",
    regionCode: "seoul",
    capacity: "6",
    meetingMode: "offline",
  };
  for (const [k, v] of Object.entries({ ...기본, ...values })) form.append(k, v);
  return form;
}

/**
 * 글자 하나를 코드 포인트로 만든다. **소스에 그 글자를 직접 박지 않는다** — 여기 다루는
 * 것이 「보이지 않는 글자」라 리터럴로 적으면 diff 에도 grep 에도 안 보이고, 파일을
 * 옮기거나 붙여 넣는 과정에 조용히 사라진다(2026-09-06 실측).
 */
const 글자 = (cp: number) => String.fromCodePoint(cp);

// ── INV-T1 · INV-T2 (S6) — `docs/specs/text-display-integrity.md` ────────────
//
// **제목 경로는 2026-09-11 까지 이 판정이 아예 없었고, 붙인 뒤에도 검사가 0건이었다**
// (test-auditor). 호출을 통째로 지워도 통합 검사는 그대로 초록불이다 — 0022 의 제약이
// 같은 값을 대신 거부하기 때문이다. 바뀌는 것은 **사용자가 보는 문구** 하나인데, 그것이
// 이 판정이 있는 유일한 이유다: 제약까지 가면 화면에 「잠시 뒤 다시 시도해 주세요」가
// 뜨고 다시 시도해도 절대 성공하지 않는다.
describe("스터디 폼 읽기 — 눈에 안 보이는 글자 (INV-T1 · INV-T2)", () => {
  it("INV-T1 (S6): 보이지 않는 글자만으로 된 제목은 「이름을 적어 주세요」로 막힌다", () => {
    // `formText` 의 `trim()` 은 이 값들을 하나도 안 자르므로 `!title` 이 거짓이 된다 —
    // 「비었다」 판정만으로는 안 잡히는 값들이다.
    for (const [이름표, 값] of [
      ["U+3000 전각 공백", 글자(0x3000)],
      ["U+00A0 줄바꿈 없는 공백", 글자(0x00a0)],
      ["U+200B 폭 없는 공백", 글자(0x200b)],
      ["U+2060 단어 이음", 글자(0x2060)],
      ["U+180E 몽골 모음 구분", 글자(0x180e)],
      ["U+FEFF BOM", 글자(0xfeff)],
      ["U+200D ZWJ 단독", 글자(0x200d)],
      ["U+3164 한글 채움", 글자(0x3164)],
    ] as const) {
      const r = readStudyFields(폼({ title: 값 }));

      expect(r.ok, `${이름표} 로만 된 제목이 통과했다`).toBe(false);
      // **문구까지 잰다.** 세 자리(이름·제목·메시지)가 같은 순서로 판정해야 같은 값에
      // 같은 설명이 나간다 — 순서가 갈리면 한쪽은 「지울 글자를 찾으라」는 막다른 길이
      // 된다(칸은 비어 보이는데 지울 것이 없다).
      expect(!r.ok && r.message, 이름표).toBe("스터디 이름을 적어 주세요");
    }
  });

  it("INV-T2 (S6): 양방향 서식 문자가 든 제목은 한국어 문구로 거부된다", () => {
    // **열두 자를 다 본다.** 한글 제목에서 화면을 실제로 깨는 것은 U+202E 하나뿐인데,
    // 히브리어 제목이면 U+202B·2067·2068 도 똑같이 깬다(스펙 실측 ③). 한 자만 재면
    // 나머지를 여는 되돌림을 아무도 못 막는다.
    for (const cp of [
      0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068,
      0x2069,
    ]) {
      const 이름표 = `U+${cp.toString(16)}`;
      const r = readStudyFields(폼({ title: `${글자(cp)}토익 900` }));

      expect(r.ok, `${이름표} 가 든 제목이 통과했다`).toBe(false);
      expect(!r.ok && r.message, 이름표).toBe(
        "화면에 안 보이는 글자가 섞여 있습니다. 붙여 넣지 말고 직접 입력해 주세요",
      );
    }
  });

  it("INV-T2 (S6): 제어문자가 든 제목도 같은 문구로 거부된다", () => {
    // 0020 의 `studies_title_no_control` 과 범위가 같아야 한다. C1 구역(U+0080–9F)이
    // 빠져 있던 것이 이름 쪽에서 실제로 났던 갈라짐이다.
    for (const cp of [0x00, 0x07, 0x09, 0x0a, 0x1f, 0x7f, 0x80, 0x85, 0x9f]) {
      const 이름표 = `U+${cp.toString(16)}`;
      const r = readStudyFields(폼({ title: `토익${글자(cp)}900` }));

      expect(r.ok, `${이름표} 가 든 제목이 통과했다`).toBe(false);
      expect(!r.ok && r.message, 이름표).toBe(
        "화면에 안 보이는 글자가 섞여 있습니다. 붙여 넣지 말고 직접 입력해 주세요",
      );
    }
  });

  // ── 판정 **순서** (2026-09-11 test-auditor) ─────────────────────────────
  //
  // **U+061C 하나가 이 순서를 가르는 유일한 값이다.** 지우는 집합과 금지 목록에 **둘 다**
  // 든 글자가 그것뿐이라, 「보이는 내용」과 「서식 문자」 판정이 동시에 참이 된다.
  // 다른 값은 어느 한쪽에만 걸려서 **두 블록의 자리를 바꿔도 답이 안 바뀐다** — 그래서
  // 위 검사들만으로는 순서가 안 붙들린다.
  //
  // 순서가 중요한 이유는 화면 문구다. 서식 문자 쪽이 먼저 걸리면 **칸이 비어 보이는데
  // 「지울 글자를 찾으라」**는 말이 나간다 — 막다른 길이다. 세 자리(이름·제목·메시지)가
  // 같은 순서여야 같은 값에 같은 설명이 나간다.
  it("INV-T1·T2 (S6, 순서): 두 판정에 다 걸리는 제목은 「적어 주세요」쪽이 이긴다", () => {
    for (const [이름표, 값] of [
      ["U+061C 단독", 글자(0x061c)],
      ["전각 공백 + U+061C", 글자(0x3000) + 글자(0x061c)],
    ] as const) {
      const r = readStudyFields(폼({ title: 값 }));

      expect(r.ok, `${이름표} 가 통과했다`).toBe(false);
      expect(!r.ok && r.message, 이름표).toBe("스터디 이름을 적어 주세요");
    }
  });

  it("INV-T1·T2 (S6, 반대 절반): 오른쪽-왼쪽 글자·이모지·띄어쓰기가 든 제목은 통과한다", () => {
    // **반대 절반이 없으면 판정을 「전부 거부」로 바꿔도 위 셋이 초록불이다.** 그리고
    // `hasControlChars` 를 `code <= 0x20` 으로 한 글자만 넓히면 **띄어쓰기가 든 제목이
    // 전부 막히는데**, 그 되돌림을 붙드는 것도 여기다.
    const ZWJ = 글자(0x200d);
    for (const 값 of [
      "토익 900",
      "새벽 토익반",
      "دراسة",
      "לימוד",
      `${글자(0x1f4da)} 같이 읽어요`,
      `${글자(0x1f468)}${ZWJ}${글자(0x1f469)} 가족 모임`,
      `cafe${글자(0x301)} 모임`,
      `토익${글자(0x200b)}900`,
    ]) {
      const r = readStudyFields(폼({ title: 값 }));
      expect(r.ok, `정상 제목이 거부됐다: ${JSON.stringify(값)}`).toBe(true);
      expect(r.ok && r.fields.title, 값).toBe(값);
    }
  });
});

describe("스터디 폼 읽기 — 날짜 셋의 모양", () => {
  // **안 보면 적힌 그대로 Postgres 로 간다.** 22007 이 짓는 문장은 보낸 값을 그대로
  // 되비치고 `dbErrorMessage` 가 그것을 로그에 찍는데, 값 안의 줄바꿈이 살아 있으므로
  // 로그인한 사람 누구나 로그 한 줄을 통째로 지어낼 수 있다.
  it("날짜가 YYYY-MM-DD 가 아니면 어느 칸인지 말하고 멈춘다", () => {
    const 나쁜값 = ["오늘", "2026/10/01", "2026-1-1", "2026-10-01\n[db] 지어낸 줄", " "];
    for (const v of 나쁜값) {
      for (const [칸, 이름] of [
        ["startsOn", "시작하는 날"],
        ["endsOn", "끝나는 날"],
        ["recruitUntil", "모집 마감일"],
      ] as const) {
        const r = readStudyFields(폼({ [칸]: v }));
        if (v.trim() === "") {
          // 빈 칸은 「안 적었다」이지 틀린 값이 아니다 — 셋 다 선택이다
          expect(r.ok, `${칸} 의 빈 값이 막혔다`).toBe(true);
          continue;
        }
        expect(r.ok, `${칸} = ${JSON.stringify(v)} 가 통과했다`).toBe(false);
        expect(!r.ok && r.message).toContain(이름);
      }
    }
  });

  it("정상 날짜는 그대로 실린다 — 비운 칸은 null 이다", () => {
    const r = readStudyFields(
      폼({ startsOn: "2026-10-01", endsOn: "2026-12-31", recruitUntil: "2026-09-30" }),
    );
    expect(r.ok).toBe(true);
    expect(r.ok && r.fields.starts_on).toBe("2026-10-01");
    expect(r.ok && r.fields.ends_on).toBe("2026-12-31");
    expect(r.ok && r.fields.recruit_until).toBe("2026-09-30");

    const 빈칸 = readStudyFields(폼());
    expect(빈칸.ok && 빈칸.fields.recruit_until).toBeNull();
  });

  // 모양 검사가 이 비교보다 앞에 있어야 성립한다 — 자리수가 다르면 글자 순서가 뒤집힌다
  it("끝나는 날이 시작하는 날보다 앞설 수 없다", () => {
    const r = readStudyFields(폼({ startsOn: "2026-10-01", endsOn: "2026-09-30" }));
    expect(r.ok).toBe(false);

    const 같은날 = readStudyFields(폼({ startsOn: "2026-10-01", endsOn: "2026-10-01" }));
    expect(같은날.ok).toBe(true);
  });

  // 호스트가 폼에서 오지 않는다는 것은 계약이다 (INV-Z4 · Z15)
  it("돌려주는 칸은 정확히 열한 개이고 호스트는 없다", () => {
    const r = readStudyFields(폼({ hostId: "44444444-4444-4444-8444-444444444444" }));
    expect(r.ok).toBe(true);
    expect(r.ok && Object.keys(r.fields).sort()).toEqual(
      [
        "category_id",
        "description",
        "ends_on",
        "location_detail",
        "max_participants",
        "meeting_mode",
        "recruit_until",
        "region_code",
        "starts_on",
        "summary",
        "title",
      ].sort(),
    );
  });
});
