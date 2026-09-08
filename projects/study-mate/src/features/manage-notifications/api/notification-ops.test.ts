/**
 * 알림을 읽음으로 바꾸고 지우는 액션. 근거 스펙: docs/specs/notifications.md
 * (INV-N4 · INV-N8) · docs/specs/auth-session.md (INV-A4)
 *
 * **여기서 붙드는 것은 두 가지다**: 세션 없이 실행되지 않는 것과, 성공한 뒤 헤더를 다시
 * 그리게 하는 것. 앞엣것이 없으면 로그인 없이 액션이 돌고, 뒤엣것이 없으면 종 옆 숫자가
 * 옛 값으로 남아 **패널은 비었는데 숫자는 3인** 상태가 된다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { createServerSupabase } from "@/shared/api/supabase/server-client";
import { NO_SESSION_MESSAGE } from "@/entities/session";
import {
  makeNotificationOps,
  markAllNotificationsRead,
  markNotificationRead,
  removeNotification,
} from "./notification-ops";

const 사용자 = { id: "11111111-1111-4111-8111-111111111111" };
const 알림 = "44444444-4444-4444-8444-444444444444";
const 헤더다시그리기 = vi.fn();

function 폼(values: Record<string, string> = {}): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries({ notificationId: 알림, ...values })) form.append(k, v);
  return form;
}

/** 데이터베이스 대신 쓰는 가짜. 좁힌 조건과 보낸 값을 기록한다. */
function 가짜DB(error: { code?: string; message?: string } | null = null) {
  const 기록 = {
    테이블: [] as string[],
    좁힌것: [] as [string, unknown][],
    보낸값: null as Record<string, unknown> | null,
    지웠나: false,
  };
  const factory = vi.fn(async () => ({
    from(table: string) {
      기록.테이블.push(table);
      // **조건을 몇 개 붙이든 받는다.** 하나만 받게 해 두면 조건이 하나 늘 때 가짜가
      // 먼저 죽어서, 무엇이 바뀌었는지가 아니라 「가짜가 안 맞는다」로만 보인다.
      const chain = {
        eq(column: string, value: unknown) {
          기록.좁힌것.push([column, value]);
          return chain;
        },
        is(column: string, value: unknown) {
          기록.좁힌것.push([column, value]);
          return chain;
        },
        then<T>(resolve: (v: { error: unknown }) => T) {
          return Promise.resolve({ error }).then(resolve);
        },
      };
      // 목록 읽기도 같은 가짜를 지난다 — `load` 가 실제로 성공해야 「목록을 여는 것만으로는
      // 헤더를 안 그린다」가 뜻을 가진다. 던져서 끝나면 그 단언은 무엇으로도 통과한다.
      const read = {
        select: () => read,
        order: () => read,
        limit: () => Promise.resolve({ data: [], error: null }),
        in: () => Promise.resolve({ data: [], error: null }),
      };
      return {
        ...read,
        update(values: Record<string, unknown>) {
          기록.보낸값 = values;
          return chain;
        },
        delete() {
          기록.지웠나 = true;
          return chain;
        },
      };
    },
  }));
  return { factory: factory as unknown as typeof createServerSupabase, 기록 };
}

beforeEach(() => {
  헤더다시그리기.mockClear();
});

describe("알림 읽음 처리", () => {
  it("INV-N5: 보내는 값은 read_at 하나뿐이다 — 다른 열을 실으면 요청이 통째로 거부된다", async () => {
    const db = 가짜DB();
    await markNotificationRead(사용자, 폼(), db.factory);

    expect(db.기록.테이블).toEqual(["notifications"]);
    expect(Object.keys(db.기록.보낸값 ?? {})).toEqual(["read_at"]);
  });

  it("INV-N4: 누구 것인지는 조건에 안 적는다 — 그 판정의 주인은 접근 정책이다", async () => {
    const db = 가짜DB();
    await markNotificationRead(사용자, 폼(), db.factory);

    // 이미 읽은 줄을 다시 안 쓴다 — 없으면 누를 때마다 저장된 「읽은 시각」이 밀린다
    expect(db.기록.좁힌것).toEqual([
      ["id", 알림],
      ["read_at", null],
    ]);
    expect(db.기록.좁힌것.some(([c]) => c === "user_id")).toBe(false);
  });

  it("id 가 uuid 모양이 아니면 데이터베이스에 가지 않는다", async () => {
    const db = 가짜DB();
    const r = await markNotificationRead(사용자, 폼({ notificationId: "그런거 없음" }), db.factory);

    expect(r.ok).toBe(false);
    expect(db.기록.테이블).toEqual([]);
  });

  it("0행이어도 성공이다 — 이미 읽은 알림을 다시 눌러도 사용자가 할 일은 없다", async () => {
    const db = 가짜DB();
    await expect(markNotificationRead(사용자, 폼(), db.factory)).resolves.toMatchObject({ ok: true });
  });

  it("데이터베이스 오류는 실패로 돌려주고 원문을 화면에 내보내지 않는다", async () => {
    const db = 가짜DB({ code: "42501", message: "permission denied for column type" });
    const r = await markNotificationRead(사용자, 폼(), db.factory);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).not.toContain("permission denied");
  });
});

describe("전체 읽음", () => {
  it("INV-N4: 안 읽은 것만 대상이고, 자기 것인지는 접근 정책이 정한다", async () => {
    const db = 가짜DB();
    await markAllNotificationsRead(사용자, db.factory);

    // 조건은 「안 읽은 것」 하나뿐이다 — 그 사람 것인지는 접근 정책이 정한다
    expect(db.기록.좁힌것).toEqual([["read_at", null]]);
    // INV-N5: 여기서도 보내는 값은 read_at 하나뿐이다. 열이 하나 더 실리면 0019 의 열
    // 권한이 요청을 통째로 거부해서 **「전체 읽음」이 영영 실패**한다
    expect(Object.keys(db.기록.보낸값 ?? {})).toEqual(["read_at"]);
  });
});

describe("알림 삭제", () => {
  it("INV-N4: 그 알림 하나만 지운다", async () => {
    const db = 가짜DB();
    await removeNotification(사용자, 폼(), db.factory);

    expect(db.기록.지웠나).toBe(true);
    expect(db.기록.좁힌것).toEqual([["id", 알림]]);
  });

  it("id 가 없으면 데이터베이스에 가지 않는다 — 조건 없는 삭제가 나가면 안 된다", async () => {
    const db = 가짜DB();
    const form = new FormData();
    const r = await removeNotification(사용자, form, db.factory);

    expect(r.ok).toBe(false);
    expect(db.기록.지웠나).toBe(false);
  });
});

describe("조립 — 세션과 헤더", () => {
  const 조립 = (user: { id: string } | null, db = 가짜DB()) =>
    makeNotificationOps(async () => user as never, {
      createSupabase: db.factory,
      revalidateHeader: 헤더다시그리기,
    });

  it("INV-A4: 세션이 없으면 셋 다 실행되지 않는다", async () => {
    const db = 가짜DB();
    const ops = 조립(null, db);

    for (const r of [await ops.markRead(폼()), await ops.markAllRead(), await ops.remove(폼())]) {
      expect(r).toEqual({ ok: false, message: NO_SESSION_MESSAGE });
    }
    expect(db.기록.테이블).toEqual([]);
    expect(헤더다시그리기).not.toHaveBeenCalled();
  });

  it("INV-N8: 읽음 처리가 성공하면 헤더를 다시 그리게 한다", async () => {
    await 조립(사용자).markRead(폼());

    expect(헤더다시그리기).toHaveBeenCalledTimes(1);
  });

  it("INV-N8: 전체 읽음도 헤더를 다시 그리게 한다", async () => {
    await 조립(사용자).markAllRead();

    expect(헤더다시그리기).toHaveBeenCalledTimes(1);
  });

  it("INV-N8: 삭제도 헤더를 다시 그리게 한다 — 안 읽은 알림을 지우면 숫자가 줄어야 한다", async () => {
    await 조립(사용자).remove(폼());

    expect(헤더다시그리기).toHaveBeenCalledTimes(1);
  });

  it("INV-N8: 실패했을 때는 다시 그리지 않는다", async () => {
    const db = 가짜DB({ code: "42501", message: "permission denied" });
    await 조립(사용자, db).markRead(폼());

    expect(헤더다시그리기).not.toHaveBeenCalled();
  });

  it("목록을 여는 것만으로는 헤더를 다시 그리지 않는다 — 보던 화면이 통째로 갱신된다", async () => {
    const db = 가짜DB();
    const r = await 조립(사용자, db).load();

    expect(r.ok).toBe(true); // 성공한 읽기여야 이 단언에 뜻이 있다
    expect(헤더다시그리기).not.toHaveBeenCalled();
  });
});
