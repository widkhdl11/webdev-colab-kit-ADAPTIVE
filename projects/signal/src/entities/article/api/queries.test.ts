import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 피드 조회 — badge-keywords INV-B4.
 *
 * **이 파일이 생긴 이유**(2026-08-31): 조회가 "최신 200건" 하나였고, 그 200칸을 성격이
 * 다른 둘이 나눠 쓰고 있었다 — 뱃지 줄은 *시간* 기준(최근 3일)이고 목록은 *건수* 기준이다.
 * 3일치가 200건을 넘으면 뱃지가 있는 글을 다 못 세서 숫자가 조용히 작아졌고,
 * **화면에는 아무 표시도 안 났다.** 실측: 창 185건(상한의 92%), 지금까지의 최악 424건.
 *
 * 여기서 붙드는 것은 **창 조회에 건수 제한이 없다**는 것 하나다. 그게 이 수정의 전부이고,
 * `.limit()` 이 다시 붙는 순간 옛 결함으로 돌아간다.
 */

/**
 * PostgREST 체이닝을 흉내내는 가짜. 무엇이 불렸는지를 기록한다.
 *
 * `countByCall` 은 서버가 세어 돌려주는 총계(`count: "exact"`)다 — 안 주면 받은 행수와 같다고 본다.
 * 이 둘이 갈리는 것이 곧 "잘렸다"이므로, 따로 줄 수 있어야 그 경로를 볼 수 있다.
 */
function fakeDb(rowsByCall: unknown[][], countByCall: (number | undefined)[] = []) {
  const calls: {
    gte?: string;
    lt?: string;
    limit?: number;
    order?: string;
    count?: string;
  }[] = [];
  let call = -1;

  const makeChain = () => {
    call += 1;
    const at = call;
    calls[at] = {};
    const rows = rowsByCall[at] ?? [];
    const count = countByCall[at] ?? rows.length;
    const chain: Record<string, unknown> = {
      select: (_cols: string, opts?: { count?: string }) => {
        if (opts?.count !== undefined) calls[at].count = opts.count;
        return chain;
      },
      order: (col: string) => {
        calls[at].order = col;
        return chain;
      },
      gte: (_col: string, v: string) => {
        calls[at].gte = v;
        return chain;
      },
      lt: (_col: string, v: string) => {
        calls[at].lt = v;
        return chain;
      },
      limit: (n: number) => {
        calls[at].limit = n;
        return chain;
      },
      // await 되는 지점 — then 을 구현해 thenable 로 만든다.
      then: (resolve: (r: unknown) => unknown) => resolve({ data: rows, count, error: null }),
    };
    return chain;
  };

  return { db: { from: () => makeChain() }, calls };
}

const publicSupabase = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api/supabase-public", () => ({ publicSupabase }));

const { fetchFeedArticles, FEED_TAIL, TAIL_DAY_CAP } = await import("./queries");

const row = (id: string, publishedAt: string) => ({
  id,
  original_url: `https://example.com/${id}`,
  title: id,
  title_ko: null,
  summary: "",
  source_excerpt: null,
  summary_points: [],
  source_id: "test-source",
  source_name: "테스트",
  official_basis: "none",
  published_at: publishedAt,
  item_tag: [],
});

const WINDOW_START = "2026-08-29T00:00:00+09:00";

describe("fetchFeedArticles — 창은 건수로 자르지 않는다 (INV-B4)", () => {
  beforeEach(() => {
    publicSupabase.mockReset();
  });

  it("창 조회에는 `.limit()` 을 걸지 않는다 — 이게 이 수정의 전부다", async () => {
    const { db, calls } = fakeDb([[], []]);
    publicSupabase.mockReturnValue(db);

    await fetchFeedArticles({ windowStartIso: WINDOW_START });

    const windowCall = calls.find((c) => c.gte !== undefined);
    expect(windowCall).toBeDefined();
    expect(windowCall?.gte).toBe(WINDOW_START);
    // 건수 제한이 붙으면 3일치가 그 수를 넘는 날 뱃지 숫자가 조용히 작아진다.
    expect(windowCall?.limit).toBeUndefined();
  });

  it("창 밖 조회에는 건수 제한이 있다 — 목록이 무한정 길어지면 안 된다", async () => {
    const { db, calls } = fakeDb([[], []]);
    publicSupabase.mockReturnValue(db);

    await fetchFeedArticles({ windowStartIso: WINDOW_START });

    const tailCall = calls.find((c) => c.lt !== undefined);
    expect(tailCall).toBeDefined();
    expect(tailCall?.lt).toBe(WINDOW_START);
    expect(tailCall?.limit).toBe(FEED_TAIL);
  });

  it("두 조회의 경계가 같아서 겹치지도 새지도 않는다", async () => {
    const { db, calls } = fakeDb([[], []]);
    publicSupabase.mockReturnValue(db);

    await fetchFeedArticles({ windowStartIso: WINDOW_START });

    // `>=` 와 `<` 가 같은 값을 봐야 한 건도 안 겹치고 안 샌다.
    expect(calls.find((c) => c.gte !== undefined)?.gte).toBe(
      calls.find((c) => c.lt !== undefined)?.lt,
    );
  });

  it("창 안이 먼저, 창 밖이 뒤로 이어 붙는다", async () => {
    const { db } = fakeDb([
      [row("new", "2026-08-30T00:00:00.000Z")],
      [row("old", "2026-07-01T00:00:00.000Z")],
    ]);
    publicSupabase.mockReturnValue(db);

    const out = await fetchFeedArticles({ windowStartIso: WINDOW_START });
    expect(out.items.map((a) => a.id)).toEqual(["new", "old"]);
  });

  it("창 밖 글도 돌려준다 — 목록에서 날짜 그룹을 내려갈 수 있어야 한다 (BK16)", async () => {
    const { db } = fakeDb([[], [row("old", "2026-07-01T00:00:00.000Z")]]);
    publicSupabase.mockReturnValue(db);

    const out = await fetchFeedArticles({ windowStartIso: WINDOW_START });
    expect(out.items.map((a) => a.id)).toEqual(["old"]);
  });

  it("창을 못 정하면 한 번만 물어본다 — 화면이 통째로 비는 것보다 낫다", async () => {
    const { db, calls } = fakeDb([[row("a", "2026-08-30T00:00:00.000Z")]]);
    publicSupabase.mockReturnValue(db);

    const out = await fetchFeedArticles({ windowStartIso: null });
    expect(calls).toHaveLength(1);
    expect(calls[0].gte).toBeUndefined();
    expect(calls[0].limit).toBe(FEED_TAIL);
    expect(out.items.map((a) => a.id)).toEqual(["a"]);
  });

  it("창 밖 건수는 리터럴로 못 박는다", () => {
    // 값을 상수에서 파생시키면 어떤 값으로 바꿔도 통과한다(rules/tdd.md).
    expect(FEED_TAIL).toBe(120);
  });
});

/**
 * 창 밖 마지막 날짜를 통째로 채운다 — ingestion-ranking INV-R5 (2026-09-19 리뷰).
 *
 * 건수로 자르면 마지막 행이 하루 한가운데 떨어지고, 그 그룹에서 뽑은 상위 N 은
 * "그 날의 상위"가 아니다. 화면에는 아무 표시가 안 나서 틀린 뱃지가 조용히 붙는다.
 *
 * `tail` 을 2 로 줄여 상한에 닿은 상태를 작은 고정물로 만든다.
 */
describe("fetchFeedArticles — 마지막 날짜 그룹 (INV-R5)", () => {
  beforeEach(() => {
    publicSupabase.mockReset();
  });

  const TAIL = 2;
  // KST 기준 같은 날. 세 번째 조회의 경계가 이 날 00:00(KST) = 전날 15:00Z 여야 한다.
  const D1 = "2026-07-01T10:00:00.000Z";
  const D1_LATER = "2026-07-01T09:00:00.000Z";
  const D1_KEY = "2026-07-01";
  const D1_START = "2026-06-30T15:00:00.000Z";

  it("INV-R5: 상한에 닿으면 마지막 날짜를 그 날 경계부터 다시 받는다", async () => {
    const { db, calls } = fakeDb([
      [],
      [row("a", D1), row("b", D1_LATER)],
      [row("a", D1), row("b", D1_LATER), row("c", "2026-07-01T00:30:00.000Z")],
    ]);
    publicSupabase.mockReturnValue(db);

    const out = await fetchFeedArticles({ windowStartIso: WINDOW_START, tail: TAIL });

    expect(calls).toHaveLength(3);
    expect(calls[2].gte).toBe(D1_START);
    expect(calls[2].lt).toBe(WINDOW_START);
    expect(calls[2].limit).toBe(TAIL_DAY_CAP);
    // 채운 결과로 갈아 끼운다 — 남겨 두면 같은 글이 두 번 들어간다.
    expect(out.items.map((a) => a.id)).toEqual(["a", "b", "c"]);
    expect(out.partialDayKey).toBeNull();
  });

  it("프로브(상한 미달): 더 받을 것이 없으면 세 번째 조회를 안 한다", async () => {
    // 이 항목이 없으면 「언제나 한 번 더 묻는」 구현도 위 항목을 통과한다.
    const { db, calls } = fakeDb([[], [row("a", D1)]]);
    publicSupabase.mockReturnValue(db);

    const out = await fetchFeedArticles({ windowStartIso: WINDOW_START, tail: TAIL });

    expect(calls).toHaveLength(2);
    expect(out.partialDayKey).toBeNull();
  });

  it("INV-R5 (실패경로): 그 날이 상한을 넘으면 뱃지에서 뺀다 — 반쯤 채운 그룹에 상위를 뽑지 않는다", async () => {
    // 서버가 센 총계가 받은 행수보다 크다 = 상한에서 잘렸다 = 그 날은 끝내 완전해지지 않는다.
    const { db } = fakeDb(
      [[], [row("a", D1), row("b", D1_LATER)], [row("a", D1), row("b", D1_LATER)]],
      [undefined, undefined, 9999],
    );
    publicSupabase.mockReturnValue(db);

    const out = await fetchFeedArticles({ windowStartIso: WINDOW_START, tail: TAIL });

    expect(out.partialDayKey).toBe(D1_KEY);
    // 목록은 죽이지 않는다 — 뱃지만 포기한다.
    expect(out.items.map((a) => a.id)).toEqual(["a", "b"]);
  });

  it("INV-R5 (실패경로): 창을 못 정하면 마지막 날짜를 뱃지에서 뺀다", async () => {
    // 이 가지는 날짜 그룹의 완전성을 보장할 방법이 아예 없다.
    const { db } = fakeDb([[row("a", D1)]]);
    publicSupabase.mockReturnValue(db);

    const out = await fetchFeedArticles({ windowStartIso: null });

    expect(out.partialDayKey).toBe(D1_KEY);
  });

  it("하루 상한은 리터럴로 못 박는다 — 실측 최악(424건)보다 위여야 한다", () => {
    expect(TAIL_DAY_CAP).toBe(500);
    // 값을 상수에서 파생시키면 어떤 값으로 바꿔도 통과한다(rules/tdd.md).
    expect(FEED_TAIL).toBe(120);
  });
});

/**
 * 잘림 경보 — **이 조회가 고치려던 결함을 잡는 유일한 알람**이다.
 *
 * 2026-08-31 리뷰 지적: 이 가지를 지나는 테스트가 없어서 블록을 통째로 지워도 전부 green 이었다.
 * 원래 결함이 "뱃지 숫자가 조용히 작아지는데 화면에 아무 표시도 안 난다"였으므로,
 * 그 마지막 신호가 안 붙들려 있으면 고친 것이 아니다.
 *
 * 상한 숫자를 비교하지 않는 이유도 같은 지적에서 나왔다 — Supabase 의 `max-rows` 는
 * **레포 밖 설정**이라 누가 바꾸면 상수가 조용히 낡는다. 서버가 센 총계와 실제 받은 행수를
 * 비교하면 그 값이 무엇이든 정확하다.
 */
describe("fetchFeedArticles — 창이 잘리면 조용히 넘어가지 않는다", () => {
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => row(`r${i}`, "2026-08-30T00:00:00.000Z"));

  beforeEach(() => {
    publicSupabase.mockReset();
    vi.restoreAllMocks();
  });

  it("창 조회에 총계를 같이 요청한다 — 이게 없으면 잘림을 알 방법이 없다", async () => {
    const { db, calls } = fakeDb([[], []]);
    publicSupabase.mockReturnValue(db);
    await fetchFeedArticles({ windowStartIso: WINDOW_START });
    expect(calls.find((c) => c.gte !== undefined)?.count).toBe("exact");
  });

  it("서버가 센 수보다 적게 받으면 경고한다", async () => {
    // 서버에는 500건인데 300건만 왔다 = 잘렸다.
    const { db } = fakeDb([rows(300), []], [500, undefined]);
    publicSupabase.mockReturnValue(db);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await fetchFeedArticles({ windowStartIso: WINDOW_START });

    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain("500");
    expect(String(warn.mock.calls[0][0])).toContain("300");
  });

  it("다 받았으면 경고하지 않는다 — 부재만 보면 절반이다", async () => {
    // 1000행이어도 총계와 같으면 정상이다. 옛 방식(행수를 상한과 비교)은 여기서 오탐했다.
    const { db } = fakeDb([rows(1000), []], [1000, undefined]);
    publicSupabase.mockReturnValue(db);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await fetchFeedArticles({ windowStartIso: WINDOW_START });

    expect(warn).not.toHaveBeenCalled();
  });

  it("창을 못 정해 폴백으로 갈 때도 흔적을 남긴다", async () => {
    // 프로덕션 경로에는 없는 가지지만, 도달하면 뱃지가 작아지는데 화면은 멀쩡해 보인다.
    const { db } = fakeDb([[]]);
    publicSupabase.mockReturnValue(db);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await fetchFeedArticles({ windowStartIso: null });

    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("fetchFeedArticles — 두 조회의 실패를 구별한다", () => {
  beforeEach(() => {
    publicSupabase.mockReset();
  });

  it("창 안이 죽으면 그렇게 적는다 — 뱃지 줄이 통째로 사라지는 실패다", async () => {
    const db = {
      from: () => ({
        select: () => ({
          gte: () => ({
            order: () => Promise.resolve({ data: null, count: null, error: { message: "boom" } }),
          }),
          lt: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
        }),
      }),
    };
    publicSupabase.mockReturnValue(db);
    await expect(fetchFeedArticles({ windowStartIso: WINDOW_START })).rejects.toThrow("창 안");
  });

  it("창 밖이 죽으면 그렇게 적는다 — 날짜 그룹만 짧아지는 실패다", async () => {
    const db = {
      from: () => ({
        select: () => ({
          gte: () => ({ order: () => Promise.resolve({ data: [], count: 0, error: null }) }),
          lt: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: null, error: { message: "boom" } }),
            }),
          }),
        }),
      }),
    };
    publicSupabase.mockReturnValue(db);
    await expect(fetchFeedArticles({ windowStartIso: WINDOW_START })).rejects.toThrow("창 밖");
  });
});
