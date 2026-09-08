/**
 * 종 옆 숫자를 세는 쪽. 근거 스펙: docs/specs/notifications.md (INV-N8)
 *
 * **INV-N8 은 벽이 둘인데 그동안 「그리는 쪽」만 붙들려 있었다.** 세는 조건
 * (`read_at is null`)을 지우면 숫자가 읽은 것까지 세고, 패널을 열기 전 화면은
 * 「숫자 3, 열면 안 읽음 0」이 된다 — 불변식의 위반 문장 그대로다
 * (2026-09-08 test-auditor).
 */
import { describe, expect, it, vi } from "vitest";
import type { createServerSupabase } from "@/shared/api/supabase/server-client";
import { readUnreadNotificationCount } from "./read-unread-count";

function 가짜DB(결과: { count: number | null; error: unknown }) {
  const 건조건: Record<string, unknown> = {};
  const factory = vi.fn(async () => ({
    from(table: string) {
      건조건.table = table;
      const q = {
        select(columns: string, opts?: Record<string, unknown>) {
          건조건.columns = columns;
          건조건.opts = opts;
          return q;
        },
        is(c: string, v: unknown) {
          건조건[`is:${c}`] = v;
          return Promise.resolve(결과);
        },
      };
      return q;
    },
  }));
  return { factory: factory as unknown as typeof createServerSupabase, 건조건 };
}

describe("안 읽은 알림 수", () => {
  it("INV-N8: 세는 조건은 「읽은 시각이 비어 있다」다 — 그리는 쪽과 같은 값이어야 한다", async () => {
    const db = 가짜DB({ count: 3, error: null });

    await expect(readUnreadNotificationCount(db.factory)).resolves.toBe(3);

    expect(db.건조건.table).toBe("notifications");
    // 이 조건이 없으면 읽은 알림까지 세어 숫자가 목록보다 커진다
    expect(db.건조건["is:read_at"]).toBeNull();
  });

  it("행을 안 가져오고 개수만 센다 — 헤더 하나 때문에 알림 백 줄을 실어 올 이유가 없다", async () => {
    const db = 가짜DB({ count: 0, error: null });
    await readUnreadNotificationCount(db.factory);

    expect(db.건조건.opts).toMatchObject({ count: "exact", head: true });
  });

  it("누구 것인지는 조건에 안 적는다 — 그 판정의 주인은 접근 정책이다", async () => {
    const db = 가짜DB({ count: 1, error: null });
    await readUnreadNotificationCount(db.factory);

    expect(Object.keys(db.건조건).some((k) => k.includes("user_id"))).toBe(false);
  });

  it("실패하면 0 으로 접는다 — 헤더 하나 때문에 화면 전체가 죽지 않는다", async () => {
    const db = 가짜DB({ count: null, error: { message: "boom" } });

    await expect(readUnreadNotificationCount(db.factory)).resolves.toBe(0);
  });

  it("연결 자체가 던져도 0 이다", async () => {
    const factory = vi.fn(async () => {
      throw new Error("연결 실패");
    }) as unknown as typeof createServerSupabase;

    await expect(readUnreadNotificationCount(factory)).resolves.toBe(0);
  });
});
