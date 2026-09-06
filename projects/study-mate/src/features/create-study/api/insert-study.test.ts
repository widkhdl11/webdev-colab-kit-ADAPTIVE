import { describe, expect, it, vi } from "vitest";
import type { createServerSupabase } from "@/shared/api/supabase/server-client";
import { NO_SESSION_MESSAGE } from "@/entities/session";
import { insertStudy, makeCreateStudy } from "./insert-study";

const 사용자 = { id: "11111111-1111-4111-8111-111111111111" };
const 새스터디 = "22222222-2222-4222-8222-222222222222";

function 폼(values: Record<string, string> = {}): FormData {
  const form = new FormData();
  const 기본 = {
    title: "새벽 토익반",
    description: "월수금 6시에 모여서 같이 풉니다",
    categoryId: "language",
    regionCode: "11",
    capacity: "8",
    meetingMode: "offline",
  };
  for (const [k, v] of Object.entries({ ...기본, ...values })) form.append(k, v);
  return form;
}

/**
 * 데이터베이스 대신 쓰는 가짜. 표 두 개에 차례로 쓴다(studies → study_sessions)라
 * 표마다 결과를 따로 준다 — 「스터디는 만들어졌는데 일정만 실패」 갈래가 여기 있다.
 *
 * **가짜는 스키마 제약을 하나도 안 지킨다.** 그래서 앱의 상수·어휘가 데이터베이스와
 * 어긋나는 드리프트는 여기서 원리적으로 안 보인다 — 아래 검사들이 숫자와 어휘를 직접
 * 박아 두고 근거 마이그레이션을 주석으로 다는 이유다 (2026-09-06 test-auditor).
 */
function 가짜DB(
  옵션: {
    studies?: { data: { id: string } | null; error: { code?: string; message?: string } | null };
    sessions?: { error: { code?: string; message?: string } | null };
  } = {},
) {
  const studies = 옵션.studies ?? { data: { id: 새스터디 }, error: null };
  const sessions = 옵션.sessions ?? { error: null };
  const 보낸것: Record<string, unknown[]> = {};
  const 테이블: string[] = [];
  const factory = vi.fn(async () => ({
    from(table: string) {
      테이블.push(table);
      return {
        insert(payload: unknown) {
          // ??= 로 둔다. ?. 로 두면 목록에 없는 표 이름이 조용히 안 기록돼 오타가 안 보인다.
          (보낸것[table] ??= []).push(payload);
          if (table === "studies") {
            return { select: () => ({ single: async () => studies }) };
          }
          return Promise.resolve(sessions);
        },
      };
    },
  }));
  return {
    createSupabase: factory as unknown as typeof createServerSupabase,
    보낸것,
    테이블,
    호출: factory,
  };
}

const 보낸스터디 = (db: ReturnType<typeof 가짜DB>) =>
  (db.보낸것.studies?.[0] ?? {}) as Record<string, unknown>;

describe("스터디 개설 액션", () => {
  it("INV-A4: 세션이 없으면 데이터베이스에 손도 대지 않고 정해진 문구로 실패한다", async () => {
    const db = 가짜DB();
    const 액션 = makeCreateStudy(async () => null, { createSupabase: db.createSupabase });

    await expect(액션(폼())).resolves.toEqual({ ok: false, message: NO_SESSION_MESSAGE });
    expect(db.호출).not.toHaveBeenCalled();
  });

  it("INV-A4(반대 절반): studies 에 보내는 것은 정확히 열두 칸이다", async () => {
    const db = 가짜DB();
    const 액션 = makeCreateStudy(async () => 사용자, { createSupabase: db.createSupabase });

    // **payload 를 통째로 박는다.** host_id 와 정원만 보면 meeting_mode 를 offline 으로
    // 못 박거나 recruit_until 을 빼도 전부 초록불이다 — recruit_until 은 「마감 임박순」
    // 정렬의 유일한 원천이다 (2026-09-06 test-auditor). 열두 칸은 0001_init.sql·0002 의
    // studies 컬럼과 눈으로 대조된다.
    const r = await 액션(
      폼({
        summary: "조용히",
        locationDetail: "3층",
        startsOn: "2026-10-01",
        endsOn: "2026-12-01",
        recruitUntil: "2026-09-30",
        meetingMode: "hybrid",
      }),
    );

    expect(r).toEqual({ ok: true, value: { id: 새스터디, slotError: null } });
    expect(db.테이블).toEqual(["studies"]);
    expect(보낸스터디(db)).toEqual({
      host_id: 사용자.id,
      title: "새벽 토익반",
      summary: "조용히",
      description: "월수금 6시에 모여서 같이 풉니다",
      category_id: "language",
      region_code: "11",
      location_detail: "3층",
      meeting_mode: "hybrid",
      max_participants: 8,
      starts_on: "2026-10-01",
      ends_on: "2026-12-01",
      recruit_until: "2026-09-30",
    });
  });

  it("INV-Z4: 호스트는 폼이 아니라 세션에서 온다 — 폼에 남의 id 를 넣어도 무시된다", async () => {
    const db = 가짜DB();
    const 남 = "99999999-9999-4999-8999-999999999999";

    await insertStudy(사용자, 폼({ host_id: 남, hostId: 남 }), db.createSupabase);

    expect(보낸스터디(db).host_id).toBe(사용자.id);
    expect(JSON.stringify(보낸스터디(db))).not.toContain(남);
  });

  it("정원의 경계는 2~100 이다 — 0001_init.sql 의 max_participants 제약과 같은 숫자여야 한다", async () => {
    // **숫자를 박는다.** 상수를 import 해서 상대적으로만 보면 CAPACITY_MAX 를 1000 으로
    // 옮겨도 전부 초록불인데, 실제로는 데이터베이스가 거부한다 (2026-09-06 test-auditor).
    for (const 값 of ["1", "101", "0", "-3", "여덟", ""]) {
      const db = 가짜DB();
      await expect(insertStudy(사용자, 폼({ capacity: 값 }), db.createSupabase)).resolves.toEqual({
        ok: false,
        message: "정원은 2명에서 100명 사이로 정해 주세요",
      });
      expect(db.호출).not.toHaveBeenCalled();
    }
    for (const 값 of ["2", "100"]) {
      const db = 가짜DB();
      const r = await insertStudy(사용자, 폼({ capacity: 값 }), db.createSupabase);
      expect(r.ok).toBe(true);
      expect(보낸스터디(db).max_participants).toBe(Number(값));
    }
  });

  it("진행 방식은 정해진 셋만 받고, 고른 값이 그대로 보내진다", async () => {
    for (const 값 of ["언제나", "OFFLINE", "remote"]) {
      const db = 가짜DB();
      await expect(insertStudy(사용자, 폼({ meetingMode: 값 }), db.createSupabase)).resolves.toEqual({
        ok: false,
        message: "진행 방식을 골라 주세요",
      });
      expect(db.호출).not.toHaveBeenCalled();
    }
    for (const 값 of ["offline", "online", "hybrid"]) {
      const db = 가짜DB();
      expect((await insertStudy(사용자, 폼({ meetingMode: 값 }), db.createSupabase)).ok).toBe(true);
      // 값을 안 보면 meeting_mode 를 offline 으로 못 박은 변이가 초록불이다.
      expect(보낸스터디(db).meeting_mode).toBe(값);
    }
  });

  it("글자 수 상한 — 스키마에 길이 제약이 없어 여기가 유일한 강제 위치다", async () => {
    const 짝 = [
      ["title", 61, "스터디 이름은 60자까지 적을 수 있습니다"],
      ["summary", 81, "한 줄 소개는 80자까지 적을 수 있습니다"],
      ["description", 4001, "설명은 4000자까지 적을 수 있습니다"],
      ["locationDetail", 61, "장소는 60자까지 적을 수 있습니다"],
    ] as const;
    for (const [칸, 길이, 문구] of 짝) {
      const db = 가짜DB();
      await expect(
        insertStudy(사용자, 폼({ [칸]: "가".repeat(길이) }), db.createSupabase),
      ).resolves.toEqual({ ok: false, message: 문구 });
      expect(db.호출).not.toHaveBeenCalled();
      // 경계 안쪽 짝.
      const db2 = 가짜DB();
      expect(
        (await insertStudy(사용자, 폼({ [칸]: "가".repeat(길이 - 1) }), db2.createSupabase)).ok,
      ).toBe(true);
    }
  });

  it("끝나는 날이 시작하는 날보다 앞서면 거부하고, 같은 날은 통과한다", async () => {
    const db = 가짜DB();
    await expect(
      insertStudy(사용자, 폼({ startsOn: "2026-10-01", endsOn: "2026-09-30" }), db.createSupabase),
    ).resolves.toEqual({ ok: false, message: "끝나는 날이 시작하는 날보다 앞설 수 없습니다" });
    expect(db.호출).not.toHaveBeenCalled();

    // 데이터베이스 제약은 ends_on >= starts_on 이다. 반대 절반이 없으면 조건을 좁힌
    // 변이도 초록불이고, 하루짜리 스터디를 못 만들게 된다.
    const db2 = 가짜DB();
    const 같은날 = 폼({ startsOn: "2026-10-01", endsOn: "2026-10-01" });
    expect((await insertStudy(사용자, 같은날, db2.createSupabase)).ok).toBe(true);
  });

  it("빠진 칸마다 무엇이 빠졌는지 말하고 데이터베이스를 부르지 않는다", async () => {
    const 짝 = [
      ["title", "스터디 이름을 적어 주세요"],
      ["description", "어떤 스터디인지 설명을 적어 주세요"],
      ["categoryId", "카테고리를 골라 주세요"],
      ["regionCode", "지역을 골라 주세요"],
    ] as const;
    for (const [칸, 문구] of 짝) {
      const db = 가짜DB();
      await expect(insertStudy(사용자, 폼({ [칸]: "" }), db.createSupabase)).resolves.toEqual({
        ok: false,
        message: 문구,
      });
      expect(db.호출).not.toHaveBeenCalled();
    }
  });

  it("데이터베이스가 거부하면 그 원문을 화면으로 보내지 않는다", async () => {
    // 전에는 error.message 를 문구에 붙이고 있어서 제약 이름·표 이름·정책 유무가
    // 폼 하나로 새 나갔다 (2026-09-06 security-reviewer).
    const 로그 = vi.spyOn(console, "error").mockImplementation(() => {});
    const 정책거부 = 'new row violates row-level security policy for table "studies"';
    const db = 가짜DB({ studies: { data: null, error: { code: "42501", message: 정책거부 } } });

    const r = await insertStudy(사용자, 폼(), db.createSupabase);

    expect(r).toEqual({
      ok: false,
      message: "스터디 개설하지 못했습니다. 잠시 뒤 다시 시도해 주세요",
    });
    로그.mockRestore();
  });

  it("검사 제약 위반의 영어 문장도 화면으로 안 보낸다 — 코드가 우리 트리거와 같아도", async () => {
    const 로그 = vi.spyOn(console, "error").mockImplementation(() => {});
    const 제약위반 =
      'new row for relation "studies" violates check constraint "studies_recruit_until_finite"';
    const db = 가짜DB({ studies: { data: null, error: { code: "23514", message: 제약위반 } } });

    const r = await insertStudy(사용자, 폼({ recruitUntil: "infinity" }), db.createSupabase);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).not.toContain("check constraint");
      expect(r.message).not.toContain("studies_recruit_until_finite");
    }
    로그.mockRestore();
  });

  it("우리가 지은 문장은 그대로 보여 준다", async () => {
    const db = 가짜DB({
      studies: { data: null, error: { code: "P0001", message: "지금은 스터디를 만들 수 없습니다" } },
    });

    const r = await insertStudy(사용자, 폼(), db.createSupabase);

    expect(r).toEqual({ ok: false, message: "지금은 스터디를 만들 수 없습니다" });
  });

  it("일정이 있으면 스터디 id 를 붙여 두 번째 표에 쓴다 — 세 줄을 끝까지 읽는다", async () => {
    const db = 가짜DB();

    // 유효한 줄을 **둘** 두고 사이 줄을 비운다. 유효한 줄이 하나뿐이면 루프를 첫 줄에서
    // 끊은 변이도 초록불이다 (2026-09-06 test-auditor).
    const r = await insertStudy(
      사용자,
      폼({
        weekday0: "1",
        startsAt0: "18:00",
        endsAt0: "20:00",
        weekday2: "3",
        startsAt2: "19:00",
        endsAt2: "21:00",
      }),
      db.createSupabase,
    );

    expect(r.ok).toBe(true);
    expect(db.테이블).toEqual(["studies", "study_sessions"]);
    expect(db.보낸것.study_sessions[0]).toEqual([
      { weekday: 1, starts_at: "18:00", ends_at: "20:00", study_id: 새스터디 },
      { weekday: 3, starts_at: "19:00", ends_at: "21:00", study_id: 새스터디 },
    ]);
  });

  it("일정만 실패해도 만들어진 스터디 id 를 버리지 않는다", async () => {
    // 버리면 화면이 개설 폼에 남고, 다시 제출하면 같은 스터디가 하나 더 생긴다
    // (2026-09-06 code-reviewer).
    const 로그 = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = 가짜DB({ sessions: { error: { code: "08006", message: "nope" } } });

    const r = await insertStudy(
      사용자,
      폼({ weekday0: "0", startsAt0: "09:00", endsAt0: "11:00" }),
      db.createSupabase,
    );

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.id).toBe(새스터디);
      expect(r.value.slotError).not.toBeNull();
    }
    로그.mockRestore();
  });

  it("스터디 쓰기가 실패하면 일정 표에는 손대지 않는다", async () => {
    const 로그 = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = 가짜DB({ studies: { data: null, error: { code: "08006", message: "denied" } } });

    const r = await insertStudy(
      사용자,
      폼({ weekday0: "0", startsAt0: "09:00", endsAt0: "11:00" }),
      db.createSupabase,
    );

    expect(r.ok).toBe(false);
    expect(db.테이블).toEqual(["studies"]);
    로그.mockRestore();
  });

  it("오류 없이 행이 안 돌아오면 성공으로 말하지 않는다", async () => {
    const 로그 = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = 가짜DB({ studies: { data: null, error: null } });

    await expect(insertStudy(사용자, 폼(), db.createSupabase)).resolves.toEqual({
      ok: false,
      message: "스터디를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요",
    });
    로그.mockRestore();
  });
});
