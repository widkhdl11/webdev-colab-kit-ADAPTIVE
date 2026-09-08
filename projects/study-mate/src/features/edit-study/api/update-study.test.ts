import { beforeEach, describe, expect, it, vi } from "vitest";
import type { createServerSupabase } from "@/shared/api/supabase/server-client";
import { NO_SESSION_MESSAGE } from "@/entities/session";
import { CAPACITY_MAX, CAPACITY_MIN, TITLE_MAX } from "@/entities/study/model/limits";
import { makeUpdateStudy, updateStudy } from "./update-study";

const 사용자 = { id: "11111111-1111-4111-8111-111111111111" };
const 다시받기 = vi.fn();
const 스터디 = "33333333-3333-4333-8333-333333333333";
// **폼이 보내는 값과 데이터베이스가 돌려주는 값을 다르게 둔다.** 같으면 성공 값을
// `studyId` 로 바꿔도(없는 스터디·남의 스터디의 id 가 그대로 캐시 경로와 목적지로 나간다)
// 단언이 통과한다.
const 저장된스터디 = "55555555-5555-4555-8555-555555555555";

function 폼(values: Record<string, string> = {}): FormData {
  const form = new FormData();
  const 기본 = {
    studyId: 스터디,
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

type 일정행 = { id: string; weekday: number; starts_at: string; ends_at: string };

/**
 * 데이터베이스 대신 쓰는 가짜. **좁히는 조건과 일정 쪽 요청까지 기록한다** — 갱신에서
 * `.eq("host_id", …)` 가 빠지면 화면은 그대로 동작하고 정책만이 유일한 방벽이 되고,
 * 일정을 통째로 지우도록 바뀌어도 본문 단언만으로는 안 걸린다.
 */
function 가짜DB(옵션: {
  결과?: { data: { id: string } | null; error: { code?: string; message?: string } | null };
  일정?: 일정행[];
  일정오류?: { 읽기?: { code?: string; message?: string }; 지우기?: { code?: string; message?: string }; 넣기?: { code?: string; message?: string } };
} = {}) {
  const 결과 = 옵션.결과 ?? { data: { id: 저장된스터디 }, error: null };
  const 일정 = 옵션.일정 ?? [];
  const 오류 = 옵션.일정오류 ?? {};

  const 보낸것: Record<string, unknown>[] = [];
  const 테이블: string[] = [];
  const 좁힌것: [string, unknown][] = [];
  const 지운것: string[][] = [];
  const 넣은것: Record<string, unknown>[][] = [];
  // **일정 쪽 요청의 조건과 순서까지 적는다.** 조건을 안 적으면 `.eq("study_id", …)` 를
  // 지워도 전부 초록불인데, 그 상태의 제품은 조회 정책이 `using (true)` 라서 남의 일정까지
  // 읽고 그것을 지울 목록으로 쓴다. 순서를 안 적으면 넣기를 지우기보다 앞에 둬도 초록불인데,
  // 그 상태에서는 끝 시각만 바꾼 줄이 유일 제약에 걸려 영영 안 바뀐다 (2026-09-07 감사).
  const 일정조건: [string, unknown][] = [];
  const 일정순서: string[] = [];

  const factory = vi.fn(async () => ({
    from(table: string) {
      테이블.push(table);
      if (table === "study_sessions") {
        return {
          select: () => ({
            eq: async (column: string, value: unknown) => {
              일정조건.push([column, value]);
              일정순서.push("read");
              return { data: 일정, error: 오류.읽기 ?? null };
            },
          }),
          delete: () => {
            const chain = {
              eq(column: string, value: unknown) {
                일정조건.push([column, value]);
                return chain;
              },
              in: async (_column: string, ids: string[]) => {
                지운것.push(ids);
                일정순서.push("delete");
                return { error: 오류.지우기 ?? null };
              },
            };
            return chain;
          },
          insert: async (rows: Record<string, unknown>[]) => {
            넣은것.push(rows);
            일정순서.push("insert");
            return { error: 오류.넣기 ?? null };
          },
        };
      }
      return {
        update(payload: Record<string, unknown>) {
          보낸것.push(payload);
          const chain = {
            eq(column: string, value: unknown) {
              좁힌것.push([column, value]);
              return chain;
            },
            select: () => ({ maybeSingle: async () => 결과 }),
          };
          return chain;
        },
      };
    },
  }));

  return {
    factory: factory as unknown as typeof createServerSupabase,
    보낸것,
    테이블,
    좁힌것,
    지운것,
    넣은것,
    일정조건,
    일정순서,
    호출: factory,
  };
}

describe("스터디 수정 액션", () => {
  beforeEach(() => 다시받기.mockClear());

  it("INV-A4: 세션이 없으면 데이터베이스에 손도 대지 않고 정해진 문구로 실패한다", async () => {
    const db = 가짜DB();
    const 액션 = makeUpdateStudy(async () => null, {
      createSupabase: db.factory,
      revalidatePaths: 다시받기,
    });

    await expect(액션(폼())).resolves.toEqual({ ok: false, message: NO_SESSION_MESSAGE });
    expect(db.호출).not.toHaveBeenCalled();
  });

  it("INV-A4(반대 절반): 세션이 있으면 갱신하고, 데이터베이스가 돌려준 id 를 값으로 준다", async () => {
    const db = 가짜DB();
    const 액션 = makeUpdateStudy(async () => 사용자, {
      createSupabase: db.factory,
      revalidatePaths: 다시받기,
    });

    await expect(액션(폼())).resolves.toEqual({
      ok: true,
      value: { id: 저장된스터디, slotError: null, slotsWiped: false },
    });
    expect(db.테이블[0]).toBe("studies");
  });

  // **고친 값이 나오는 화면 전부다.** 모집글 목록·상세와 홈이 스터디의 제목·정원·좌석을
  // 그대로 그리므로, 하나를 빼도 초록불이면 「목록만 낡은」 상태가 조용히 생긴다.
  it("성공하면 고친 값이 나오는 화면 다섯을 다시 받게 하고, 실패하면 안 지운다", async () => {
    const db = 가짜DB();
    const 액션 = makeUpdateStudy(async () => 사용자, {
      createSupabase: db.factory,
      revalidatePaths: 다시받기,
    });

    await 액션(폼());
    // **데이터베이스가 돌려준 id 로 지운다** — 폼 값으로 지우면 남의 스터디를 고치려 한
    // 요청의 id 가 그대로 캐시 경로로 나간다
    expect(다시받기.mock.calls).toEqual([
      [`/studies/${저장된스터디}`, "/posts", "/profile", "/", "/chats"],
    ]);

    다시받기.mockClear();
    const 빈DB = 가짜DB({ 결과: { data: null, error: null } });
    const 실패 = makeUpdateStudy(async () => 사용자, {
      createSupabase: 빈DB.factory,
      revalidatePaths: 다시받기,
    });
    await 실패(폼());
    expect(다시받기).not.toHaveBeenCalled();
  });

  // 이것이 이 액션의 인가다. **정책이 두 번째 방벽이고 이 줄이 첫 번째다** —
  // 빠지면 남의 스터디를 고치라고 보내고 데이터베이스가 조용히 0행을 돌려준다.
  it("INV-Z15: 갱신 대상을 「그 스터디」이자 「내가 여는 스터디」로 좁힌다", async () => {
    const db = 가짜DB();

    await updateStudy(사용자, 폼(), db.factory);

    expect(db.좁힌것).toEqual([
      ["id", 스터디],
      ["host_id", 사용자.id],
    ]);
  });

  it("INV-Z4: 누구의 스터디인지는 폼이 아니라 세션이 정한다 — 폼에 남의 id 를 넣어도 안 쓴다", async () => {
    const db = 가짜DB();
    const 남 = "99999999-9999-4999-8999-999999999999";

    await updateStudy(사용자, 폼({ host_id: 남, hostId: 남, userId: 남 }), db.factory);

    expect(db.좁힌것).toContainEqual(["host_id", 사용자.id]);
    expect(JSON.stringify(db.보낸것[0])).not.toContain(남);
    expect(JSON.stringify(db.좁힌것)).not.toContain(남);
  });

  // **보내는 칸을 통째로 박는다.** 데이터베이스의 갱신 권한 목록에 `host_id` 가 없어서
  // 넷째 칸이 늘면 화면은 그대로인데 요청이 통째로 거부되기 시작한다. `deleted_at`·
  // `closed_at` 은 권한 목록에는 있지만 이 화면의 일이 아니다 — 실리면 수정 폼 하나로
  // 스터디를 지우거나 모집을 닫을 수 있게 된다.
  it("INV-Z15: 보내는 것은 정확히 열한 칸이다 — 호스트·삭제 표시·모집 마감은 안 실린다", async () => {
    const db = 가짜DB();
    const 남 = "99999999-9999-4999-8999-999999999999";

    await updateStudy(
      사용자,
      폼({
        summary: "새벽에 조용히",
        locationDetail: "역삼역 스터디카페",
        startsOn: "2026-10-01",
        endsOn: "2026-12-31",
        recruitUntil: "2026-09-30",
        host_id: 남,
        deleted_at: "2026-09-07T00:00:00Z",
        closed_at: "2026-09-07T00:00:00Z",
      }),
      db.factory,
    );

    expect(db.보낸것[0]).toEqual({
      title: "새벽 토익반",
      summary: "새벽에 조용히",
      description: "화목 6시에 모입니다",
      category_id: "language",
      region_code: "seoul",
      location_detail: "역삼역 스터디카페",
      meeting_mode: "offline",
      max_participants: 6,
      starts_on: "2026-10-01",
      ends_on: "2026-12-31",
      recruit_until: "2026-09-30",
    });
  });

  it("어느 스터디인지 안 실려 오면 데이터베이스를 부르지 않는다", async () => {
    const db = 가짜DB();

    await expect(updateStudy(사용자, 폼({ studyId: "" }), db.factory)).resolves.toEqual({
      ok: false,
      message: "어느 스터디를 고치는지 알 수 없습니다",
    });
    expect(db.호출).not.toHaveBeenCalled();
  });

  it("칸이 규칙을 어기면 데이터베이스를 부르지 않는다 — 개설 폼과 같은 판정이다", async () => {
    const db = 가짜DB();

    await expect(updateStudy(사용자, 폼({ title: "   " }), db.factory)).resolves.toEqual({
      ok: false,
      message: "스터디 이름을 적어 주세요",
    });
    // 문구에 숫자를 박는다 — 상수로만 비교하면 상한을 통째로 늘려도 초록불이다
    await expect(
      updateStudy(사용자, 폼({ title: "가".repeat(TITLE_MAX + 1) }), db.factory),
    ).resolves.toEqual({ ok: false, message: "스터디 이름은 60자까지 적을 수 있습니다" });
    await expect(
      updateStudy(사용자, 폼({ capacity: String(CAPACITY_MIN - 1) }), db.factory),
    ).resolves.toEqual({ ok: false, message: "정원은 2명에서 100명 사이로 정해 주세요" });
    await expect(
      updateStudy(사용자, 폼({ capacity: String(CAPACITY_MAX + 1) }), db.factory),
    ).resolves.toEqual({ ok: false, message: "정원은 2명에서 100명 사이로 정해 주세요" });
    expect(db.호출).not.toHaveBeenCalled();
  });

  it("일정 줄이 규칙을 어기면 본문도 저장하지 않는다 — 반쯤 저장된 상태를 안 만든다", async () => {
    const db = 가짜DB();

    await expect(
      updateStudy(사용자, 폼({ weekday0: "1", startsAt0: "21:00", endsAt0: "19:00" }), db.factory),
    ).resolves.toEqual({
      ok: false,
      message: "1번째 모임 일정의 끝 시각이 시작 시각보다 뒤여야 합니다",
    });
    expect(db.호출).not.toHaveBeenCalled();
  });

  // **남의 스터디거나 이미 지워진 것이면 여기로 온다** (INV-Z15 · Z16). 좁힌 조건이나
  // 갱신 정책에 안 맞으면 갱신은 0행이고 오류가 아니다. 이 갈래가 없으면 "저장했습니다"가
  // 나가면서 아무것도 안 바뀐다.
  it("INV-Z15(실패경로): 내 스터디가 아니면 오류 없이 0행이 오고, 그것을 성공으로 읽지 않는다", async () => {
    const db = 가짜DB({ 결과: { data: null, error: null } });

    await expect(updateStudy(사용자, 폼(), db.factory)).resolves.toEqual({
      ok: false,
      message: "고칠 수 있는 스터디가 아닙니다. 내가 여는 스터디인지 확인해 주세요",
    });
  });

  it("데이터베이스가 거부하면 그 원문을 화면으로 보내지 않는다", async () => {
    const 경고 = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = 가짜DB({
      결과: {
        data: null,
        error: { code: "42501", message: 'new row violates row-level security policy for table "studies"' },
      },
    });

    await expect(updateStudy(사용자, 폼(), db.factory)).resolves.toEqual({
      ok: false,
      message: "스터디를 수정하지 못했습니다. 잠시 뒤 다시 시도해 주세요",
    });
    expect(경고).toHaveBeenCalled();
  });

  it("우리가 지은 문장은 그대로 보여 준다 — 정원을 지금 인원보다 낮춘 경우가 여기다", async () => {
    const 경고 = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = 가짜DB({
      결과: {
        data: null,
        error: { code: "P0001", message: "이미 참여 중인 인원보다 정원을 작게 줄일 수 없습니다" },
      },
    });

    await expect(updateStudy(사용자, 폼(), db.factory)).resolves.toEqual({
      ok: false,
      message: "이미 참여 중인 인원보다 정원을 작게 줄일 수 없습니다",
    });
    expect(경고).not.toHaveBeenCalled();
  });

  describe("모임 일정 — 바뀐 줄만 건드린다", () => {
    const 저장된일정 = [
      { id: "s1", weekday: 1, starts_at: "19:00:00", ends_at: "21:00:00" },
      { id: "s2", weekday: 3, starts_at: "10:00:00", ends_at: "12:00:00" },
    ];
    const 그대로 = {
      weekday0: "1",
      startsAt0: "19:00",
      endsAt0: "21:00",
      weekday1: "3",
      startsAt1: "10:00",
      endsAt1: "12:00",
    };

    it("아무것도 안 바뀌면 지우지도 넣지도 않는다", async () => {
      const db = 가짜DB({ 일정: 저장된일정 });

      await updateStudy(사용자, 폼(그대로), db.factory);

      expect(db.지운것).toEqual([]);
      expect(db.넣은것).toEqual([]);
    });

    it("바뀐 줄만 지우고 넣는다 — 안 건드린 줄은 그대로 둔다", async () => {
      const db = 가짜DB({ 일정: 저장된일정 });

      await updateStudy(
        사용자,
        폼({ ...그대로, weekday1: "5", startsAt1: "07:00", endsAt1: "08:00" }),
        db.factory,
      );

      expect(db.지운것).toEqual([["s2"]]);
      expect(db.넣은것).toEqual([
        [{ weekday: 5, starts_at: "07:00", ends_at: "08:00", study_id: 스터디 }],
      ]);
    });

    it("줄을 다 비우면 있던 것을 전부 지운다", async () => {
      const db = 가짜DB({ 일정: 저장된일정 });

      await updateStudy(사용자, 폼(), db.factory);

      expect(db.지운것).toEqual([["s1", "s2"]]);
      expect(db.넣은것).toEqual([]);
    });

    // **여기가 사람이 고른 위험이다** (2026-09-07). 지우기와 넣기를 한 요청으로 못 묶으므로
    // 넣기가 실패하면 지워진 줄이 안 돌아온다. 본문은 이미 저장됐으니 실패로 뭉개지 않고,
    // 무엇이 안 됐는지를 값에 실어 화면이 말하게 한다.
    it("일정 저장이 실패해도 본문 저장은 성공으로 남고, 무엇이 안 됐는지 같이 온다", async () => {
      const 경고 = vi.spyOn(console, "error").mockImplementation(() => {});
      const db = 가짜DB({
        일정: 저장된일정,
        일정오류: { 넣기: { code: "42501", message: "row-level security" } },
      });

      const 결과 = await updateStudy(
        사용자,
        폼({ ...그대로, weekday1: "5", startsAt1: "07:00", endsAt1: "08:00" }),
        db.factory,
      );

      expect(결과.ok).toBe(true);
      expect(결과.ok && 결과.value.slotError).toBe(
        "모임 일정을 저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요",
      );
      // **지우기는 이미 끝난 상태다.** 이 갈래를 「일정은 안 바뀌었다」로 말하면 거짓이고,
      // 사용자가 해야 할 일도 다르다 — 화면이 두 문장을 가르는 근거가 이 값이다.
      expect(결과.ok && 결과.value.slotsWiped).toBe(true);
      expect(db.지운것).toEqual([["s2"]]);
      expect(경고).toHaveBeenCalled();
    });

    // 지우기 실패 갈래는 아무도 안 붙들고 있었다 — 가짜는 `지우기` 오류를 받게 만들어져
    // 있었는데 그것을 넣는 검사가 없었다(2026-09-07 code-reviewer). 그 줄이 없으면 지우기가
    // 실패한 뒤에도 넣기가 그대로 나가고, 옛 줄이 살아 있으니 유일 제약에 걸려 실패 원인이
    // 한 겹 뒤로 밀린다.
    it("일정 지우기가 실패하면 거기서 멈추고, 넣기는 안 나간다", async () => {
      const 경고 = vi.spyOn(console, "error").mockImplementation(() => {});
      const db = 가짜DB({
        일정: 저장된일정,
        일정오류: { 지우기: { code: "42501", message: "row-level security" } },
      });

      const 결과 = await updateStudy(
        사용자,
        폼({ ...그대로, weekday1: "5", startsAt1: "07:00", endsAt1: "08:00" }),
        db.factory,
      );

      expect(결과.ok).toBe(true);
      expect(결과.ok && 결과.value.slotError).toBe(
        "모임 일정을 저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요",
      );
      // 지우기가 안 됐으니 옛 줄은 그대로 있다 — 「지워진 상태」가 아니다
      expect(결과.ok && 결과.value.slotsWiped).toBe(false);
      expect(db.넣은것).toEqual([]);
      expect(경고).toHaveBeenCalled();
    });

    // 조건과 순서. 둘 다 이 파일이 기록만 하고 안 보던 자리다(2026-09-07 감사).
    // **읽기와 지우기를 따로 본다** — 한 검사에 묶으면 둘 중 하나가 열려도 다른 쪽 단언이
    // 대신 빨간불을 내서 변이 판정이 어느 갈래가 깨졌는지 못 가른다.
    const 바꾼폼 = () => 폼({ ...그대로, weekday1: "5", startsAt1: "07:00", endsAt1: "08:00" });

    it("일정을 읽을 때 그 스터디로 좁힌다", async () => {
      const db = 가짜DB({ 일정: 저장된일정 });
      await updateStudy(사용자, 바꾼폼(), db.factory);

      // 조회 정책이 `using (true)` 라, 안 좁히면 데이터베이스의 모든 스터디 일정이 온다
      expect(db.일정조건[0]).toEqual(["study_id", 스터디]);
    });

    it("일정을 지울 때도 그 스터디로 좁힌다", async () => {
      const db = 가짜DB({ 일정: 저장된일정 });
      await updateStudy(사용자, 바꾼폼(), db.factory);

      // 겹쳐 건 방벽이다 — 읽기 쪽 필터가 사라지는 날 이것이 남아야 남의 일정이 안 지워진다
      expect(db.일정조건).toEqual([
        ["study_id", 스터디],
        ["study_id", 스터디],
      ]);
    });

    it("지우기가 넣기보다 먼저 나간다", async () => {
      const db = 가짜DB({ 일정: 저장된일정 });
      await updateStudy(사용자, 바꾼폼(), db.factory);

      // 끝 시각만 바꾼 줄은 요일·시작 시각이 같아서, 옛 줄이 남아 있으면 못 들어간다
      expect(db.일정순서).toEqual(["read", "delete", "insert"]);
    });

    it("넣기가 실패하면 바꾸려던 줄이 지워진 상태라는 것을 값이 말한다", async () => {
      const 경고 = vi.spyOn(console, "error").mockImplementation(() => {});
      const db = 가짜DB({
        일정: 저장된일정,
        일정오류: { 넣기: { code: "42501", message: "row-level security" } },
      });

      const 결과 = await updateStudy(사용자, 바꾼폼(), db.factory);

      // 화면이 「일정은 그대로입니다」와 「지금 지워진 상태입니다」를 가르는 근거다
      expect(결과.ok && 결과.value.slotsWiped).toBe(true);
      expect(db.지운것).toEqual([["s2"]]);
      expect(경고).toHaveBeenCalled();
    });

    it("일정을 못 읽으면 그것도 실패로 들려 보낸다 — 조용히 「안 바뀜」으로 읽지 않는다", async () => {
      const 경고 = vi.spyOn(console, "error").mockImplementation(() => {});
      const db = 가짜DB({ 일정오류: { 읽기: { code: "42501", message: "row-level security" } } });

      const 결과 = await updateStudy(사용자, 폼(그대로), db.factory);

      expect(결과.ok).toBe(true);
      expect(결과.ok && 결과.value.slotError).not.toBeNull();
      expect(db.지운것).toEqual([]);
      expect(db.넣은것).toEqual([]);
      expect(경고).toHaveBeenCalled();
    });
  });
});
