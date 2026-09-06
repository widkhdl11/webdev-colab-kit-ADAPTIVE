import { describe, expect, it, vi } from "vitest";
import type { createServerSupabase } from "@/shared/api/supabase/server-client";
import type { revalidateEntityPath } from "@/shared/lib/revalidate-entity";
import { NO_SESSION_MESSAGE } from "@/entities/session";
import { insertApplication, makeApply } from "./insert-application";

const 사용자 = { id: "11111111-1111-4111-8111-111111111111" };
const 스터디 = "22222222-2222-4222-8222-222222222222";
const 모집글 = "33333333-3333-4333-8333-333333333333";

function 폼(values: Record<string, string> = {}): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries({ studyId: 스터디, postId: 모집글, ...values }))
    form.append(k, v);
  return form;
}

/**
 * 데이터베이스 대신 쓰는 가짜. **검증 대상은 여기 없다** — 붙드는 것은 "우리가 무엇을
 * 보내는가"이고, 그 값이 정책을 통과하는지는 통합 검사가 실제 데이터베이스에 대고 본다
 * (tests/integration/participation-capacity.test.ts).
 */
function 가짜DB(error: { code?: string; message?: string } | null = null) {
  const 보낸것: Record<string, unknown>[] = [];
  const 테이블: string[] = [];
  const factory = vi.fn(async () => ({
    from(table: string) {
      테이블.push(table);
      return {
        insert(payload: Record<string, unknown>) {
          보낸것.push(payload);
          return Promise.resolve({ error });
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

function 준비(옵션: { 세션?: typeof 사용자 | null; db?: ReturnType<typeof 가짜DB> } = {}) {
  const db = 옵션.db ?? 가짜DB();
  const revalidate = vi.fn(() => true) as unknown as typeof revalidateEntityPath;
  const 세션 = 옵션.세션 === undefined ? 사용자 : 옵션.세션;
  return {
    db,
    revalidate,
    액션: makeApply(async () => 세션, { createSupabase: db.createSupabase, revalidate }),
  };
}

describe("참가 신청 액션", () => {
  it("INV-A4: 세션이 없으면 데이터베이스에 손도 대지 않고 정해진 문구로 실패한다", async () => {
    const { db, revalidate, 액션 } = 준비({ 세션: null });

    await expect(액션(폼())).resolves.toEqual({ ok: false, message: NO_SESSION_MESSAGE });
    expect(db.호출).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("INV-A4(반대 절반): participants 에 보내는 것은 정확히 세 칸이다", async () => {
    const { db, 액션 } = 준비();

    await expect(액션(폼())).resolves.toEqual({ ok: true, value: null });
    expect(db.테이블).toEqual(["participants"]);
    // **payload 를 통째로 박는다.** `user_id` 만 보면 `study_id` 를 빼거나 바꿔도 초록불인데,
    // 실제로는 `participants.study_id not null` 이라 기능이 100% 죽는다
    // (2026-09-06 test-auditor). 세 칸은 0001_init.sql 의 participants 컬럼과 대조된다.
    expect(db.보낸것).toEqual([{ study_id: 스터디, user_id: 사용자.id, status: "pending" }]);
  });

  it("INV-Z4: 신청자는 폼이 아니라 세션에서 온다 — 폼에 남의 id 를 넣어도 무시된다", async () => {
    const 남 = "99999999-9999-4999-8999-999999999999";
    const { db, 액션 } = 준비();

    await 액션(폼({ user_id: 남, userId: 남 }));

    expect(db.보낸것[0]?.user_id).toBe(사용자.id);
    expect(JSON.stringify(db.보낸것[0])).not.toContain(남);
  });

  // 이름에 INV-P4 를 달지 않는다. INV-P4 의 조건(대기 상태이고 모집 중일 때만 수락)은
  // 데이터베이스가 판정하고, 여기서 붙드는 것은 「우리가 보내는 status 는 pending 이다」
  // 하나다. 이름에 INV 를 달면 커버리지 집계에서 유닛도 그것을 붙드는 것처럼 보인다
  // (2026-09-06 test-auditor).
  it("새 신청은 언제나 pending 으로 들어간다 — 폼이 승인 상태를 보낼 수 없다", async () => {
    const { db, 액션 } = 준비();

    await 액션(폼({ status: "accepted" }));

    expect(db.보낸것[0]?.status).toBe("pending");
  });

  it("성공하면 그 모집글 화면의 캐시를 지운다", async () => {
    const { revalidate, 액션 } = 준비();

    await 액션(폼());

    // 이 단언이 없으면 캐시 지우기를 통째로 지워도 초록불이다 — 신청은 됐는데 화면에는
    // 「신청하기」가 그대로 남는 상태가 아무 신호 없이 만들어진다.
    expect(revalidate).toHaveBeenCalledWith("/posts", 모집글);
  });

  it("INV-P4(앱 쪽 절반): 정책이 거부하면 성공으로 말하지 않고 캐시도 안 지운다", async () => {
    const { revalidate, 액션 } = 준비({ db: 가짜DB({ code: "42501" }) });

    await expect(액션(폼())).resolves.toEqual({
      ok: false,
      message: "지금은 신청할 수 없는 스터디입니다",
    });
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("이미 신청했으면 데이터베이스가 지은 문장 대신 사람의 말로 알린다", async () => {
    const { 액션 } = 준비({ db: 가짜DB({ code: "23505" }) });

    await expect(액션(폼())).resolves.toEqual({ ok: false, message: "이미 신청한 스터디입니다" });
  });

  it("그 밖의 거부도 실패로 돌려주고, 원문을 화면으로 보내지 않는다", async () => {
    const 로그 = vi.spyOn(console, "error").mockImplementation(() => {});
    const { revalidate, 액션 } = 준비({
      db: 가짜DB({ code: "22P02", message: 'invalid input syntax for type uuid: "zzz"' }),
    });

    await expect(액션(폼())).resolves.toEqual({
      ok: false,
      message: "신청하지 못했습니다. 잠시 뒤 다시 시도해 주세요",
    });
    expect(revalidate).not.toHaveBeenCalled();
    expect(로그).toHaveBeenCalled();
    로그.mockRestore();
  });

  it("스터디를 안 골랐으면 데이터베이스를 부르지 않는다", async () => {
    const { db, 액션 } = 준비();

    await expect(액션(폼({ studyId: "" }))).resolves.toEqual({
      ok: false,
      message: "어느 스터디인지 알 수 없습니다",
    });
    expect(db.호출).not.toHaveBeenCalled();
  });

  it("본체를 직접 불러도 같은 것을 보낸다 — 조립이 값을 더 만들지 않는다", async () => {
    const db = 가짜DB();

    await expect(insertApplication(사용자, 스터디, db.createSupabase)).resolves.toEqual({
      ok: true,
      value: null,
    });
    expect(db.보낸것).toEqual([{ study_id: 스터디, user_id: 사용자.id, status: "pending" }]);
  });
});
