import { describe, expect, it, vi } from "vitest";
import type { createServerSupabase } from "@/shared/api/supabase/server-client";
import { readMyParticipations } from "./read-my-participations";

const 나 = "11111111-1111-4111-8111-111111111111";
const 남 = "99999999-9999-4999-8999-999999999999";

type 행 = {
  id: string;
  study_id: string;
  status: string;
  created_at: string;
  study: { id: string; title: string; category_id: string; host_id: string } | null;
};

function 신청(덮어쓸: Partial<행> = {}): 행 {
  return {
    id: "a1",
    study_id: "s1",
    status: "pending",
    created_at: "2026-09-01T00:00:00Z",
    study: { id: "s1", title: "토익 새벽반", category_id: "language", host_id: 남 },
    ...덮어쓸,
  };
}

/**
 * 데이터베이스 대신 쓰는 가짜.
 *
 * **돌려주는 행만이 아니라 무엇을 물었는지도 기록한다.** 질의에 건 조건(내 것만 ·
 * 상태 셋만)은 여기 안 남기면 아무도 안 붙든다 — 가짜는 무슨 조건이든 그대로 통과시키므로
 * 조건을 지워도 돌려주는 행이 똑같다.
 */
function 가짜DB(행들: 행[], error: { code?: string; message?: string } | null = null) {
  const 건조건: Record<string, unknown> = {};
  const factory = vi.fn(async () => ({
    from(table: string) {
      건조건.table = table;
      const q = {
        select(columns: string) {
          건조건.columns = columns;
          return q;
        },
        eq(column: string, value: unknown) {
          건조건[`eq:${column}`] = value;
          return q;
        },
        in(column: string, values: readonly unknown[]) {
          건조건[`in:${column}`] = [...values];
          return q;
        },
        order(column: string, opts: unknown) {
          건조건.order = [column, opts];
          return Promise.resolve({ data: 행들, error });
        },
      };
      return q;
    },
  }));
  return { factory: factory as unknown as typeof createServerSupabase, 건조건 };
}

describe("내 신청 현황 조회", () => {
  it("내 것만 묻는다 — 참여자 조회는 남의 수락된 행도 보여 주므로(INV-Z11) 안 거르면 섞인다", async () => {
    const db = 가짜DB([신청()]);
    await readMyParticipations(나, db.factory);

    expect(db.건조건.table).toBe("participants");
    expect(db.건조건["eq:user_id"]).toBe(나);
  });

  it("상태 다섯 중 셋만 묻는다 — 승인된 시각 기준이 정한 상태가 셋이다", async () => {
    const db = 가짜DB([신청()]);
    await readMyParticipations(나, db.factory);

    expect(db.건조건["in:status"]).toEqual(["pending", "accepted", "rejected"]);
  });

  it("스터디는 바깥 조인이다 — `!inner` 로 묶으면 지워진 스터디의 신청 행까지 사라진다", async () => {
    const db = 가짜DB([신청()]);
    await readMyParticipations(나, db.factory);

    expect(db.건조건.columns).toContain("study:studies(");
    expect(db.건조건.columns).not.toContain("studies!inner");
  });

  it("내가 호스트인 스터디의 참여 행은 뺀다 — 스터디를 만들 때 같이 생기는 행이라 두 번 나온다", async () => {
    const db = 가짜DB([
      신청({ id: "내스터디", study: { id: "s9", title: "내가 연 것", category_id: "it", host_id: 나 } }),
      신청({ id: "남스터디" }),
    ]);

    const 결과 = await readMyParticipations(나, db.factory);
    expect(결과.map((p) => p.id)).toEqual(["남스터디"]);
  });

  it("반대 절반: 남이 호스트면 그대로 남는다", async () => {
    const db = 가짜DB([신청({ id: "남스터디" })]);

    const 결과 = await readMyParticipations(나, db.factory);
    expect(결과).toHaveLength(1);
    expect(결과[0]?.study).toEqual({
      available: true,
      id: "s1",
      title: "토익 새벽반",
      categoryId: "language",
      hostId: 남,
    });
  });

  it("스터디가 안 보이면 available: false 로 오고, 그 줄도 목록에 남는다", async () => {
    const db = 가짜DB([신청({ study: null })]);

    const 결과 = await readMyParticipations(나, db.factory);
    expect(결과).toHaveLength(1);
    expect(결과[0]?.study).toEqual({ available: false, id: "s1" });
  });

  it("임베드 모양이 어긋나면 던진다 — 「안 보인다」로 떨어뜨리면 고장이 「지워진 스터디」로 그려진다", async () => {
    const db = 가짜DB([
      신청({ study: { id: "s1", title: "토익 새벽반", category_id: "language" } as 행["study"] }),
    ]);

    await expect(readMyParticipations(나, db.factory)).rejects.toThrow("내 신청 현황을(를) 읽지 못했다");
  });

  it("조회가 실패하면 원문을 밖으로 내보내지 않고 던진다", async () => {
    const db = 가짜DB([], { code: "42501", message: "permission denied for table participants" });
    const 로그 = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(readMyParticipations(나, db.factory)).rejects.toThrow("내 신청 현황을(를) 읽지 못했다");
    // 원인은 서버 로그로만 간다 — 화면 경로에 정책·테이블 이름을 넣지 않는다
    expect(로그).toHaveBeenCalled();
    로그.mockRestore();
  });
});
