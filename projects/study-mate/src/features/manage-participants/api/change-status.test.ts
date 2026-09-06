import { describe, expect, it, vi } from "vitest";
import type { createServerSupabase } from "@/shared/api/supabase/server-client";
import type { revalidateEntityPath } from "@/shared/lib/revalidate-entity";
import { NO_SESSION_MESSAGE } from "@/entities/session";
import { changeStatus, makeChangeParticipation } from "./change-status";
import type { Transition } from "../model/transitions";

const 호스트 = { id: "11111111-1111-4111-8111-111111111111" };
const 신청자 = "22222222-2222-4222-8222-222222222222";
const 스터디 = "33333333-3333-4333-8333-333333333333";

function 폼(values: Record<string, string> = {}): FormData {
  const form = new FormData();
  const 기본 = { studyId: 스터디, targetUserId: 신청자, next: "accepted" };
  for (const [k, v] of Object.entries({ ...기본, ...values })) form.append(k, v);
  return form;
}

/**
 * 데이터베이스 대신 쓰는 가짜. 기본값은 **한 행이 갱신됐다**이고, 「정책이 걸러서 0행」과
 * 「오류」를 따로 줄 수 있다 — 이 액션에서 가장 위험한 갈래가 그 둘을 가르는 자리다.
 *
 * 정책이 실제로 누구를 거르는지는 여기서 안 본다. 그것은 실제 데이터베이스에 대고 보는
 * 통합 검사의 몫이다(tests/integration/write-authorization.test.ts).
 */
function 가짜DB(
  결과: { data: { id: string }[] | null; error: { code?: string; message?: string } | null } = {
    data: [{ id: "44444444-4444-4444-8444-444444444444" }],
    error: null,
  },
) {
  const 보낸것: Record<string, unknown>[] = [];
  const 필터: [string, unknown][] = [];
  const 테이블: string[] = [];
  const factory = vi.fn(async () => ({
    from(table: string) {
      테이블.push(table);
      return {
        update(payload: Record<string, unknown>) {
          보낸것.push(payload);
          const chain = {
            eq(column: string, value: unknown) {
              필터.push([column, value]);
              return chain;
            },
            select: async () => 결과,
          };
          return chain;
        },
      };
    },
  }));
  return {
    createSupabase: factory as unknown as typeof createServerSupabase,
    보낸것,
    필터,
    테이블,
    호출: factory,
  };
}

function 준비(옵션: { 세션?: typeof 호스트 | null; db?: ReturnType<typeof 가짜DB> } = {}) {
  const db = 옵션.db ?? 가짜DB();
  const revalidate = vi.fn(() => true) as unknown as typeof revalidateEntityPath;
  const 세션 = 옵션.세션 === undefined ? 호스트 : 옵션.세션;
  return {
    db,
    revalidate,
    액션: makeChangeParticipation(async () => 세션, {
      createSupabase: db.createSupabase,
      revalidate,
    }),
  };
}

describe("참여 상태 변경 액션", () => {
  it("INV-A4: 세션이 없으면 데이터베이스에 손도 대지 않고 정해진 문구로 실패한다", async () => {
    const { db, revalidate, 액션 } = 준비({ 세션: null });

    await expect(액션(폼())).resolves.toEqual({ ok: false, message: NO_SESSION_MESSAGE });
    expect(db.호출).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("INV-A4(반대 절반): 가드가 넘겨준 사용자가 본인 탈퇴의 판정 기준이 된다", async () => {
    const { db, 액션 } = 준비();

    // 세션의 주인이 자기 자신을 탈퇴시키는 것은 통과한다.
    await expect(액션(폼({ targetUserId: 호스트.id, next: "withdrawn" }))).resolves.toEqual({
      ok: true,
      value: null,
    });
    expect(db.테이블).toEqual(["participants"]);
  });

  // 이름에 INV-Z2 를 달지 않는다. INV-Z2 는 「수락·거절·강퇴는 호스트만」이고 그 판정은
  // 접근 정책이 한다 — 여기서 붙드는 것은 화면이 실수로 남의 탈퇴를 보내는 것뿐이다
  // (2026-09-06 test-auditor). INV-Z2 의 커버는 통합 검사에 있다.
  it("남을 대신 탈퇴시킬 수 없다 — 데이터베이스를 부르지도 않는다", async () => {
    const { db, 액션 } = 준비();

    await expect(액션(폼({ next: "withdrawn" }))).resolves.toEqual({
      ok: false,
      message: "다른 사람을 대신 탈퇴시킬 수 없습니다",
    });
    expect(db.호출).not.toHaveBeenCalled();
  });

  it("INV-P7: 목록에 없는 전이는 거부한다 — pending 으로 되돌리는 것도 포함해서", async () => {
    const { db, 액션 } = 준비();

    for (const 값 of ["pending", "", "ACCEPTED", "deleted", "__proto__"]) {
      await expect(액션(폼({ next: 값 }))).resolves.toEqual({
        ok: false,
        message: "할 수 없는 동작입니다",
      });
    }
    expect(db.호출).not.toHaveBeenCalled();
  });

  it("INV-Z8(앱 쪽 절반): SET 절에 담는 것은 status 하나뿐이다", async () => {
    const { db, 액션 } = 준비();

    await 액션(폼());

    expect(db.보낸것).toEqual([{ status: "accepted" }]);
  });

  it("대상은 「이 스터디의 그 사람」으로 지목한다 — 조건 하나가 빠지면 남의 행까지 닿는다", async () => {
    const { db, 액션 } = 준비();

    await 액션(폼());

    // **순서가 아니라 「둘 다 걸렸는가」를 본다.** PostgREST 에서 필터는 순서가 없는
    // 조건들이라, 두 줄을 바꿔 적어도 동작이 같은데 순서를 박으면 빨간불이 난다
    // (2026-09-06 test-auditor). 길이 단언이 같은 열을 두 번 거는 변이를 여전히 잡는다.
    expect(new Map(db.필터)).toEqual(
      new Map([
        ["study_id", 스터디],
        ["user_id", 신청자],
      ]),
    );
    expect(db.필터).toHaveLength(2);
  });

  it("INV-Z2(S2, 앱 쪽 절반): 0행이 갱신되면 성공이 아니다 — 정책이 걸러 낸 것을 「됐다」로 말하지 않는다", async () => {
    const { revalidate, 액션 } = 준비({ db: 가짜DB({ data: [], error: null }) });

    await expect(액션(폼())).resolves.toEqual({
      ok: false,
      message: "수락할 수 없습니다. 그 신청을 찾지 못했거나 권한이 없습니다",
    });
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("행이 null 로 와도 성공이 아니다", async () => {
    const { 액션 } = 준비({ db: 가짜DB({ data: null, error: null }) });

    await expect(액션(폼({ next: "kicked" }))).resolves.toEqual({
      ok: false,
      message: "내보내기할 수 없습니다. 그 신청을 찾지 못했거나 권한이 없습니다",
    });
  });

  it("P0001: 트리거가 지은 한국어 문장은 그대로 보여 준다 — 삼키면 「수락했습니다」가 거짓이 된다", async () => {
    // 이 액션이 받는 오류의 대부분이 이 모양이다(정원 초과·지워진 스터디·끝난 신청).
    // `if (error)` 갈래를 성공으로 바꾸는 변이를 이 검사가 잡는다 (2026-09-06 test-auditor).
    const { revalidate, 액션 } = 준비({
      db: 가짜DB({
        data: null,
        error: { code: "P0001", message: "정원을 넘겨 수락할 수 없습니다: 정원 5, 수락 5" },
      }),
    });

    await expect(액션(폼())).resolves.toEqual({
      ok: false,
      message: "정원을 넘겨 수락할 수 없습니다: 정원 5, 수락 5",
    });
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("우리가 안 지은 문장은 화면으로 안 보낸다", async () => {
    const 로그 = vi.spyOn(console, "error").mockImplementation(() => {});
    const { 액션 } = 준비({
      db: 가짜DB({
        data: null,
        error: {
          code: "42501",
          message: 'new row violates row-level security policy for table "participants"',
        },
      }),
    });

    await expect(액션(폼())).resolves.toEqual({
      ok: false,
      message: "수락하지 못했습니다. 잠시 뒤 다시 시도해 주세요",
    });
    expect(로그).toHaveBeenCalled();
    로그.mockRestore();
  });

  it("누구의 신청인지 빠지면 데이터베이스를 부르지 않는다", async () => {
    const { db, 액션 } = 준비();
    const 빈칸: Record<string, string>[] = [{ studyId: "" }, { targetUserId: "" }];

    for (const 폼값 of 빈칸) {
      await expect(액션(폼(폼값))).resolves.toEqual({
        ok: false,
        message: "누구의 신청인지 알 수 없습니다",
      });
    }
    expect(db.호출).not.toHaveBeenCalled();
  });

  it("본체를 직접 불러도 같은 판정을 한다 — 조립이 판정을 더 하지 않는다", async () => {
    const db = 가짜DB();

    await expect(
      changeStatus(
        호스트,
        { studyId: 스터디, targetUserId: 신청자, next: "rejected" as Transition },
        db.createSupabase,
      ),
    ).resolves.toEqual({ ok: true, value: null });
    expect(db.보낸것[0]).toEqual({ status: "rejected" });
  });
});
