// 근거: docs/IA.md 「목록 정렬 셋」 — 「마감 임박순」의 기준은 모집 마감일이고, 순서는
// 세 덩어리다(안 지난 마감일이 가까운 것부터 · 기한 없음 · 지난 마감일이 최근 것부터).
//
// **이 규칙에는 불변식 ID 가 없다.** 스펙이 아니라 화면 목록 문서가 정한 것이라서다.
// 그래도 검사가 필요한 이유는 결함의 모양 때문이다 — 이 정렬은 오류를 하나도 안 내고
// uuid 순으로 나왔다. 화면은 「마감 임박순」이라고 적힌 채 그럴듯하게 틀렸고,
// 화면을 봐도 모르는 종류라 사람의 확인으로는 안 남는다.
//
// 조회 함수(`readPosts`)는 next 의 요청 맥락에 붙어 있어 여기서 못 부른다. 그래서 그 함수가
// 쓰는 **질의 자체**(`postsQuery`)를 공개 키 연결로 부른다. 정렬 표만 읽으면 조회 코드가
// 그 표를 안 쓰게 되어도 이 검사는 초록불이라, 붙드는 것이 절반이 된다.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SORTS, toSort, type Sort } from "@/entities/post/api/post-order";
import { postsQuery } from "@/entities/post/api/post-query";
import { admin, anonClient, cleanupCreatedUsers, createStudy, createUser, rawClient } from "./helpers";

const TITLES = {
  today: "정렬검사 오늘 마감",
  near: "정렬검사 가까운 마감",
  far: "정렬검사 먼 마감",
  beyondCap: "정렬검사 아득히 먼 마감",
  none: "정렬검사 기한 없음",
  yesterday: "정렬검사 어제 마감",
  pastNew: "정렬검사 얼마 전에 지난 마감",
  pastOld: "정렬검사 오래전에 지난 마감",
} as const;

type Key = keyof typeof TITLES;

/** 이 검사가 넣은 것만 고르는 검색어. 시드가 커져도 목록의 꼬리가 안 잘린다. */
const PREFIX = "정렬검사";

/** 이 검사가 기대하는 「마감 임박순」의 순서. 준비물의 id 는 이것의 **역순**으로 준다. */
const EXPECTED: readonly string[] = [
  TITLES.today,
  TITLES.near,
  TITLES.far,
  TITLES.beyondCap,
  TITLES.none,
  TITLES.yesterday,
  TITLES.pastNew,
  TITLES.pastOld,
];

/**
 * id 를 손으로 준다. 정렬의 마지막 키는 `id` 오름차순인데 `posts.id` 기본값은
 * `gen_random_uuid()` 라, **정렬 키가 죽었을 때 우연히 맞는 순서가 나온다.**
 * 실제로 그랬다 — 마감일 키를 무력화하는 변이가 4번에 1번 「아무도 안 붙들고 있다」로
 * 보고됐다. id 오름차순을 기대 순서의 역순으로 박아 두면 그 확률이 0 이 된다.
 */
const IDS: Record<string, string> = Object.fromEntries(
  [...EXPECTED]
    .reverse()
    .map((title, i) => [title, `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`]),
);

/** 데이터베이스가 보는 오늘에서 며칠 떨어진 날짜. 덩어리를 가르는 것이 `current_date` 라서다. */
function shift(today: string, days: number): string {
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * 순위 함수가 자르는 상한(999999)을 넘기는 거리 — 약 6800년.
 * 자르지 않으면 이 값이 「지난 마감일」 띠의 숫자 범위로 넘어간다.
 */
const BEYOND_CAP_DAYS = 2_500_000;

async function dbToday(): Promise<string> {
  const pg = await rawClient();
  try {
    return (await pg.query("select current_date::text as d")).rows[0].d as string;
  } finally {
    await pg.end();
  }
}

let seededToday = "";
let idOf: Record<Key, { study: string; post: string }>;

beforeAll(async () => {
  // **오늘을 데이터베이스에 물어본다.** JS 의 오늘로 만들면 시간대 차이 때문에 「오늘 마감」이
  // 하루 어긋나고, 그러면 경계를 붙드는 단언이 조용히 뜻을 잃는다.
  seededToday = await dbToday();
  const h = await createUser("order-host");

  // 마감일만 다르고 나머지는 같은 여덟. **상대 날짜로 만든다** — 절대 날짜로 박으면
  // 그 날이 왔을 때 코드가 안 바뀌었는데도 기대 배열이 틀려진다.
  const days: Record<Key, number | null> = {
    today: 0,
    near: 30,
    far: 365,
    beyondCap: BEYOND_CAP_DAYS,
    none: null,
    yesterday: -1,
    pastNew: -30,
    pastOld: -1000,
  };

  // 만든 순서와 마감일 순서를 **일부러 어긋나게** 둔다. 작성 시각도 손으로 준다 —
  // 한꺼번에 넣으면 created_at 이 같아져 「최신순」이 uuid 순으로 떨어진다.
  const order: Key[] = ["far", "none", "near", "today", "beyondCap", "yesterday", "pastNew", "pastOld"];

  // 고정 id 를 쓰기로 한 이상 그 id 의 소유권도 이 검사가 갖는다. 앞선 실행의 정리가 던져
  // 행이 남으면 여기서 중복 키로 죽는데, 그 빨간불은 원인을 안 가리킨다.
  await admin.from("posts").delete().in("id", Object.values(IDS));

  idOf = {} as typeof idOf;
  const rows = [];
  for (const [i, key] of order.entries()) {
    const d = days[key];
    const study = await createStudy(h.id, { recruit_until: d === null ? null : shift(seededToday, d) });
    idOf[key] = { study, post: IDS[TITLES[key]] };
    rows.push({
      id: IDS[TITLES[key]],
      study_id: study,
      title: TITLES[key],
      created_at: `2026-0${i + 1}-01T00:00:00Z`,
      author_id: h.id,
      content: "본문",
    });
  }
  const { error } = await admin.from("posts").insert(rows);
  if (error) throw new Error(`모집글 준비 실패: ${error.message}`);
}, 120_000);

afterAll(async () => {
  await cleanupCreatedUsers();
});

/**
 * 목록 화면이 보내는 질의를 그대로 보내고, 이 검사가 넣은 것을 순서대로 뽑는다.
 *
 * 검색어로 좁히는 이유는 쪽 나눔이다 — `postsQuery` 는 range 를 안 붙이므로, 전체가
 * PostgREST 의 행 상한에 걸리면 목록의 꼬리(지난 마감일 덩어리)가 잘린다.
 */
async function mineInOrder(sort: Sort): Promise<string[]> {
  const { data, error } = await postsQuery(anonClient(), { sort, q: PREFIX });
  if (error) throw new Error(`목록을 읽지 못했다(${sort}): ${error.message}`);
  return ((data ?? []) as { title: string }[]).map((r) => r.title);
}

/** 준비와 단언 사이에 데이터베이스의 날짜가 넘어갔는가. 순서 diff 보다 이 메시지가 빨리 읽힌다. */
async function assertSameDay(): Promise<void> {
  const now = await dbToday();
  if (now !== seededToday) {
    throw new Error(`자정을 넘었다: 준비 ${seededToday} / 단언 ${now}. 다시 돌린다.`);
  }
}

describe("목록 정렬 — 모집글 목록이 보내는 질의", () => {
  it("마감 임박순: 안 지난 마감일이 가까운 것부터 · 기한 없음 · 지난 마감일이 최근 것부터", async () => {
    await assertSameDay();
    // 고치기 전에는 여기가 uuid 순이라 순서가 실행마다 달랐다.
    // 그다음에는 날짜 오름차순 하나뿐이라 **가장 오래전에 지난 마감일이 맨 위**로 왔다.
    expect(await mineInOrder("deadline")).toEqual(EXPECTED);
  });

  it("마감 임박순: 오늘 마감은 아직 안 지났고, 어제 마감은 지났다", async () => {
    await assertSameDay();
    const order = await mineInOrder("deadline");
    const at = (t: string) => order.indexOf(t);
    expect(order).toHaveLength(EXPECTED.length);

    // **경계를 양쪽에서 민다.** 한쪽만 보면 반대 방향의 어긋남이 통째로 빠져나간다 —
    // `>= current_date` 를 `> current_date` 로 밀면 오늘이 뒤로 가고,
    // `>= current_date - 1` 로 밀면 어제가 앞으로 온다. 준비물에 오늘만 있으면 뒤엣것을 못 잡는다.
    expect(at(TITLES.today), "오늘 마감이 「기한 없음」보다 뒤로 갔다").toBeLessThan(at(TITLES.none));
    expect(at(TITLES.yesterday), "어제 마감이 「기한 없음」보다 앞으로 왔다").toBeGreaterThan(at(TITLES.none));
  });

  it("마감 임박순: 아득히 먼 마감일도 「기한 없음」보다 앞이다", async () => {
    await assertSameDay();
    const order = await mineInOrder("deadline");
    // 순위 함수가 상한에서 자르지 않으면 이 값(약 6800년 뒤)이 「지난 마감일」 띠의 숫자
    // 범위로 넘어가, 아직 오지도 않은 마감일이 목록의 꼬리에 붙는다.
    expect(order.indexOf(TITLES.beyondCap)).toBeLessThan(order.indexOf(TITLES.none));
  });

  it("마감 임박순: 다른 정렬과 실제로 다른 순서를 낸다", async () => {
    // 정렬 옵션이 아무 일도 안 하면 셋이 전부 같은 순서(뒤에 붙은 id 순)로 나온다.
    // 그때 위 단언만으로는 "우연히 그 순서였다"와 갈리지 않는다.
    const deadline = await mineInOrder("deadline");
    const latest = await mineInOrder("latest");
    // 만든 순서의 역순
    expect(latest).toEqual([
      TITLES.pastOld,
      TITLES.pastNew,
      TITLES.yesterday,
      TITLES.beyondCap,
      TITLES.today,
      TITLES.near,
      TITLES.none,
      TITLES.far,
    ]);
    expect(deadline).not.toEqual(latest);
  });

  it("정렬 화이트리스트: 어휘 밖의 값은 최신순으로 떨어진다", async () => {
    // 화이트리스트를 단언(value as Sort)으로 바꾸면 주소창의 아무 값이 정렬 표의 키가 된다.
    // **부재만 보면 절반이다**: 어휘 안의 값이 그대로 통과하는 것도 같이 본다.
    for (const bad of ["", "views", "created_at", "id", "../../etc", "latest;drop"]) {
      expect(toSort(bad), bad + " 가 어휘로 통과했다").toBe("latest");
    }
    expect(toSort(undefined)).toBe("latest");
    for (const good of SORTS) expect(toSort(good)).toBe(good);
  });

  it("정렬 화이트리스트가 뚫려도 질의는 최신순으로 떨어진다", async () => {
    // 두 번째 방벽이다. **어휘를 일부러 우회한 값**을 넣어야 그 줄이 실제로 돈다 —
    // toSort 를 지나온 값으로는 되돌림 가지가 한 번도 실행되지 않고, 그러면 그 줄을
    // 지워도 아무 검사가 안 깨진다.
    const { data, error } = await postsQuery(anonClient(), { sort: "views" as Sort, q: PREFIX });
    expect(error, "어휘 밖의 값이 질의를 깨뜨렸다").toBeNull();
    const titles = ((data ?? []) as { title: string }[]).map((r) => r.title);
    expect(titles, "어휘 밖의 값이 최신순으로 안 떨어졌다").toEqual(await mineInOrder("latest"));
  });

  it("정렬 셋이 전부 실제로 도는 컬럼을 가리킨다", async () => {
    // 「좋아요순」은 순서를 단언할 준비물이 없지만, 컬럼 이름이 틀어지면 목록 화면이
    // 요청마다 죽는다. 셋을 다 보내는 것만으로 그것이 잡힌다.
    //
    // 이 검사는 순서를 안 본다. 그래서 이름에 「마감 임박순」을 넣지 않는다 — 변이 판정이
    // 검사 이름의 문자열로 「무엇이 잡혔나」를 가르기 때문에, 순서를 안 보는 검사가 그
    // 이름표를 달면 이 검사의 빨간불이 순서 변이의 판정으로 읽힌다.
    for (const sort of SORTS) {
      const { error } = await postsQuery(anonClient(), { sort, q: PREFIX });
      expect(error, `정렬 ${sort} 가 오류를 냈다`).toBeNull();
    }
  });
});

describe("마감일은 달력에 있는 날짜다", () => {
  // `date` 는 'infinity' 를 받는다. 비교는 통과하고 뺄셈은 죽으므로(cannot subtract infinite
  // dates), 무한값이 하나라도 들어오면 「마감 임박순」 목록이 통째로 500 이 된다 —
  // 그 모집글은 공개라 **비로그인 방문자까지** 본다. 0009 가 두 자리를 막았다.

  it("무한한 마감일은 데이터베이스가 거부한다", async () => {
    for (const bad of ["infinity", "-infinity"]) {
      const { error } = await admin
        .from("studies")
        .update({ recruit_until: bad })
        .eq("id", idOf.today.study)
        .select();
      expect(error, `${bad} 가 그대로 들어갔다`).not.toBeNull();
      expect(error!.message).toContain("studies_recruit_until_finite");
    }

    // **부재만 보면 절반이다** — 정상 날짜는 그대로 통과하는지도 본다.
    // (제약을 `check (false)` 로 적어도 위 단언은 통과한다)
    const ok = await admin
      .from("studies")
      .update({ recruit_until: shift(seededToday, 7) })
      .eq("id", idOf.today.study)
      .select();
    expect(ok.error, "정상 날짜까지 막혔다").toBeNull();

    // 준비물을 원래대로 — 뒤따르는 검사가 이 스터디를 「오늘 마감」으로 본다.
    await admin.from("studies").update({ recruit_until: seededToday }).eq("id", idOf.today.study);
  });

  it("제약을 떼어도 순위 함수는 죽지 않는다", async () => {
    // 안전 실패 가지다. 제약이 본체이므로 평소엔 도달하지 않는다 — 그래서 제약을
    // **트랜잭션 안에서만** 떼고 되돌린다.
    const pg = await rawClient();
    try {
      await pg.query("begin");
      await pg.query("alter table public.studies drop constraint studies_recruit_until_finite");
      for (const [value, rank] of [
        ["infinity", 999999],
        ["-infinity", 2999999],
      ] as const) {
        await pg.query("update public.studies set recruit_until = $1 where id = $2", [value, idOf.today.study]);
        const r = await pg.query(
          "select public.study_deadline_rank(p.*) as rank from public.posts p where p.id = $1",
          [idOf.today.post],
        );
        expect(Number(r.rows[0].rank), `${value} 에서 순위가 어긋났다`).toBe(rank);
      }
    } finally {
      await pg.query("rollback");
      await pg.end();
    }
  });
});
