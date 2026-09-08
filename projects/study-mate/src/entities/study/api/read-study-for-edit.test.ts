/**
 * 수정 화면을 여느냐 마느냐를 정하는 판독기. 모집글 쪽(`read-post-for-edit.test.ts`)과 같은
 * 이유로 있다 — 이 파일이 없으면 `.eq("host_id", …)` 와 `.is("deleted_at", null)` 을 둘 다
 * 지워도 전 스위트가 초록불이다.
 *
 * 근거: docs/specs/write-authorization.md INV-Z15(수정은 호스트만) · INV-Z16(지워진 스터디)
 */
import { describe, expect, it, vi } from "vitest";
import type { createServerSupabase } from "@/shared/api/supabase/server-client";
import { readStudyForEdit } from "./read-study-for-edit";

const 나 = "11111111-1111-4111-8111-111111111111";
const 스터디 = "33333333-3333-4333-8333-333333333333";

type 행 = Record<string, unknown>;

function 스터디행(덮어쓸: 행 = {}): 행 {
  return {
    id: 스터디,
    title: "토익 새벽반",
    summary: null,
    description: "월수금 6시에 모입니다",
    category_id: "language",
    region_code: "seoul",
    location_detail: null,
    meeting_mode: "offline",
    max_participants: 6,
    starts_on: null,
    ends_on: null,
    recruit_until: null,
    accepted_count: 3,
    slots: [],
    ...덮어쓸,
  };
}

function 가짜DB(행: 행 | null, error: { code?: string; message?: string } | null = null) {
  const 건조건: Record<string, unknown> = {};
  const factory = vi.fn(async () => ({
    from(table: string) {
      건조건.table = table;
      const q = {
        select(columns: string) {
          건조건.columns = columns;
          return q;
        },
        eq(c: string, v: unknown) {
          건조건[`eq:${c}`] = v;
          return q;
        },
        is(c: string, v: unknown) {
          건조건[`is:${c}`] = v;
          return q;
        },
        maybeSingle: () => Promise.resolve({ data: 행, error }),
      };
      return q;
    },
  }));
  return { factory: factory as unknown as typeof createServerSupabase, 건조건 };
}

describe("수정할 스터디 조회", () => {
  it("INV-Z15: 「그 스터디」이자 「내가 여는 스터디」로 좁혀서 묻는다", async () => {
    const db = 가짜DB(스터디행());
    await readStudyForEdit(스터디, 나, db.factory);

    expect(db.건조건.table).toBe("studies");
    expect(db.건조건["eq:id"]).toBe(스터디);
    // 이 조건이 없으면 남의 스터디가 칸에 채워진 채로 수정 화면이 열린다. 저장은 정책이
    // 막지만, 사용자는 다 적은 뒤에야 막힌다.
    expect(db.건조건["eq:host_id"]).toBe(나);
  });

  it("INV-Z16: 지워진 스터디는 수정 화면도 안 연다 — 호스트에게는 계속 보이기 때문이다", async () => {
    const db = 가짜DB(스터디행());
    await readStudyForEdit(스터디, 나, db.factory);

    // 조회 정책(`studies_read`)은 「안 지워졌거나 내가 호스트」라, 호스트인 이 화면에서는
    // 지워진 스터디도 그냥 통과한다. 갱신은 정책이 전부 거부하므로 화면만 열리고
    // 저장은 하나도 안 되는 상태가 된다.
    expect(db.건조건["is:deleted_at"]).toBeNull();
  });

  // 이 파일은 열 목록을 적어만 두고 한 번도 안 봤다(2026-09-07 감사). 안 보면 `.select()`
  // 에서 `recruit_until` 을 지워도 전부 초록불인데, 그 상태의 제품은 **손대지 않은 모집
  // 마감일이 저장과 동시에 지워진다** — 판독기가 안 읽은 칸은 폼에서 빈칸이 되고, 수정은
  // 「보낸 것이 곧 전부」다. `accepted_count` 와 임베드는 모양 검사가 따로 잡지만,
  // 나머지 다섯은 아무도 안 잡는다.
  it("폼이 채우는 칸을 하나도 빠뜨리지 않고 묻는다", async () => {
    const db = 가짜DB(스터디행());
    await readStudyForEdit(스터디, 나, db.factory);

    const 열 = String(db.건조건.columns).replace(/\s+/g, " ");
    for (const 칸 of [
      "title",
      "summary",
      "description",
      "category_id",
      "region_code",
      "location_detail",
      "meeting_mode",
      "max_participants",
      "starts_on",
      "ends_on",
      "recruit_until",
      "accepted_count",
      "study_sessions(",
    ]) {
      expect(열).toContain(칸);
    }
  });

  it("없으면 null 이고 오류가 아니다 — 없는 스터디와 남의 스터디가 화면에서 같아야 한다", async () => {
    const db = 가짜DB(null);

    await expect(readStudyForEdit(스터디, 나, db.factory)).resolves.toBeNull();
  });

  it("폼이 채우는 칸을 그대로 옮기고, 시각은 폼이 쓰는 모양으로 준다", async () => {
    const db = 가짜DB(
      스터디행({
        summary: "조용히 풀고 틀린 것만",
        location_detail: "역삼역 스터디카페",
        starts_on: "2026-10-01",
        ends_on: "2026-12-31",
        recruit_until: "2026-09-30",
        slots: [
          { weekday: 3, starts_at: "10:00:00", ends_at: "12:00:00" },
          { weekday: 1, starts_at: "19:00:00", ends_at: "21:00:00" },
        ],
      }),
    );

    await expect(readStudyForEdit(스터디, 나, db.factory)).resolves.toEqual({
      id: 스터디,
      title: "토익 새벽반",
      summary: "조용히 풀고 틀린 것만",
      description: "월수금 6시에 모입니다",
      categoryId: "language",
      regionCode: "seoul",
      locationDetail: "역삼역 스터디카페",
      meetingMode: "offline",
      capacity: 6,
      startsOn: "2026-10-01",
      endsOn: "2026-12-31",
      recruitUntil: "2026-09-30",
      filled: 3,
      // **요일 순으로 세워서 준다.** 데이터베이스는 순서를 약속하지 않으므로, 안 세우면
      // 저장할 때마다 폼의 줄 순서가 뒤바뀌어 사용자가 「안 건드린 줄이 움직였다」로 읽는다.
      slots: [
        { weekday: 1, startsAt: "19:00", endsAt: "21:00" },
        { weekday: 3, startsAt: "10:00", endsAt: "12:00" },
      ],
    });
  });

  // PostgREST 는 계산 컬럼이나 임베드에서 못 만든 키를 오류 없이 빼고 돌려준다.
  // 확인하지 않으면 `undefined` 가 숫자 자리를 통과해 정원 칸이 빈 폼이 그려진다.
  it("계산 컬럼이 비면 던진다 — 값 없이 그리지 않는다", async () => {
    const 경고 = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = 가짜DB(스터디행({ accepted_count: undefined }));

    await expect(readStudyForEdit(스터디, 나, db.factory)).rejects.toThrow("수정할 스터디");
    expect(경고).toHaveBeenCalled();
  });

  it("모양 오류 로그에 사람이 쓴 글을 안 싣는다 — 키와 타입만 찍는다", async () => {
    const 경고 = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = 가짜DB(
      스터디행({ slots: undefined, description: "여기 적은 설명이 로그로 새면 안 된다" }),
    );

    await expect(readStudyForEdit(스터디, 나, db.factory)).rejects.toThrow("수정할 스터디");
    const 찍힌것 = String(경고.mock.calls[0]?.[0] ?? "");
    expect(찍힌것).not.toContain("여기 적은 설명이 로그로 새면 안 된다");
    expect(찍힌것).toContain("description:string");
  });

  it("데이터베이스가 거부하면 원문을 문구에 안 담고 던진다", async () => {
    const 경고 = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = 가짜DB(null, { code: "22P02", message: 'invalid input syntax for type uuid: "abc"' });

    await expect(readStudyForEdit(스터디, 나, db.factory)).rejects.toThrow(
      "수정할 스터디을(를) 읽지 못했다",
    );
    expect(경고).toHaveBeenCalled();
  });
});
