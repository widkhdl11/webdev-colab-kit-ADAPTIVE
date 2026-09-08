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
