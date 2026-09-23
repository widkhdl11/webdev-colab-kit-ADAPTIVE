import { publicSupabase } from "@/shared/api/supabase-public";
import { dayKey, dayStartIso } from "@/shared/lib/datetime";
import type { StoredArticle } from "../model/types";
import { toListItemRow, toStoredArticle, type StoredArticleListItem } from "./row";

/**
 * 소식 조회. 읽기는 publishable 키로 한다 — 브라우저에서 보이는 것과 서버가 보는 것이
 * 같아야 하고, 인가는 RLS 가 한다(rules/supabase).
 *
 * **점수·'뜨는 중'은 여기서 만들지 않는다** (INV-R1). 조회는 저장된 것만 돌려주고,
 * 파생값은 features/feed-ranking 의 rankFeed 가 붙인다.
 */

/** 목록에서 안 뽑는 컬럼이 하나 있다: `content_html`. 목록은 본문을 실어 나르지 않는다. */
// 테스트가 붙들 수 있게 내보낸다 — select 에서 컬럼 하나가 빠져도 조용히 null 이 되므로
// (title_ko 를 빼면 번역을 다 만들고도 화면이 전부 영어가 된다) 목록을 고정해 둔다.
export const LIST_COLUMNS =
  "id, original_url, title, title_ko, summary, source_excerpt, summary_points, source_id, source_name, official_basis, gate, published_at, item_tag(tag(name, axis)), item_kind(kind)";

// 새 요약 칸·판정 근거는 상세만 쓴다(INV-S8 · INV-G2) — 목록까지 받으면 피드 응답만 무거워진다.
const DETAIL_COLUMNS = `${LIST_COLUMNS}, content_html, one_line, summary_table, hot_issue_answers, hot_issue_reasons`;

/**
 * 창 밖에서 더 받아 오는 건수 — **날짜 그룹을 내려가는 길**이다 (INV-B4 뒷절).
 *
 * 한 페이지가 12건이니 열 번쯤 더 볼 분량이다. 2026-08-31 실측으로 최근 하루가 50~116건,
 * 조용한 기간은 하루 2~19건이라 몰린 날은 1~2일치, 한산할 때는 일주일 넘게 내려간다.
 */
export const FEED_TAIL = 120;

/**
 * 창 밖 마지막 날짜를 채울 때의 상한 (2026-09-19).
 *
 * `FEED_TAIL` 로 자르면 120번째 행이 **하루 한가운데** 떨어진다. 그 그룹은 "그 날 전체의
 * 상위 N"이 아니라 "받은 일부의 상위 N"에 뱃지를 달게 되는데(INV-R5 위반), 화면에는
 * 아무 표시가 안 난다. 그래서 마지막 날짜만 한 번 더 조회해 그룹을 완성한다.
 *
 * 이 상한은 그 조회가 무한정 커지지 않게 하는 안전장치다. 2026-08-31 실측의 최악이
 * 하루 424건이라 그보다 위에 둔다. **넘으면 채우기를 포기하고 그 날을 뱃지에서 뺀다** —
 * 반쯤 채운 그룹에 뱃지를 다는 것이 이 수정이 없애려는 바로 그 상태다.
 */
export const TAIL_DAY_CAP = 500;

/** 피드 조회 결과. 목록과, 그룹을 완성하지 못한 날짜. */
export interface FeedArticles {
  items: StoredArticleListItem[];
  /** 전체를 못 받은 날짜 키. 그 그룹에는 '뜨는 중'을 붙이면 안 된다(INV-R5). 없으면 null. */
  partialDayKey: string | null;
}

// 여기 `POSTGREST_MAX_ROWS = 1000` 이 있었다. 2026-08-31 리뷰에서 뺐다 —
// **그 값은 레포 밖(Supabase 의 `max-rows` 설정)에 있어서** 누가 5000 으로 올리면 이 상수가
// 조용히 낡는다. 그때는 5000 행에서 잘리는데 경고가 안 뜬다: 고치려던 "조용히 작아진다"가
// 그대로 돌아온다. 지금은 `count: "exact"` 로 **서버가 알려 준 총계**와 실제 받은 행수를
// 비교한다 — 설정이 무엇이든 정확하고, "마침 딱 1000행"인 정상 케이스도 오탐하지 않는다.

function parseRows(data: unknown[] | null): StoredArticleListItem[] {
  // 경계를 통과 못 한 행은 버린다. 한 건이 빠지는 것과 목록이 통째로 사라지는 것은 다르다.
  return (data ?? [])
    .map(toListItemRow)
    .filter((a): a is StoredArticleListItem => a !== null);
}

/**
 * 피드에 그릴 목록. 날짜 그룹·정렬·개수 제한은 화면 쪽(selectFeed)이 하므로
 * 여기서는 최근 것부터 넉넉히 가져온다.
 *
 * 랭킹으로 정렬해서 가져올 수는 없다 — 점수가 DB 에 없기 때문이다(INV-R1).
 * 그래서 발행시각 기준으로 자르고, 점수 정렬은 그 안에서 한다.
 *
 * ## 왜 조회가 둘인가 (2026-08-31)
 *
 * 전에는 "최신 200건" 하나였다. 그 200칸을 **성격이 다른 둘이 나눠 쓰고 있었다**:
 * 뱃지 줄은 *시간* 기준(최근 3일, INV-B4)이고 목록은 *건수* 기준인데, 한 칸에서 서로를 민다.
 *
 * 2026-08-31 실측에서 3일치가 **185건**이라 200칸의 92%를 먹었고(목록은 15건만 남았다),
 * 지금까지의 최악은 **424건**이라 이미 창을 자른 날이 있었다. 창이 잘리면 뱃지 숫자가
 * 있는 글을 다 못 세서 작아지는데 **화면에는 아무 표시도 안 난다.**
 *
 * 그래서 갈랐다:
 *   ① 창 안(`published_at >= 창시작`)은 **건수 제한 없이** 전부 — 집계가 구조적으로 완전해진다
 *   ② 창 밖은 `FEED_TAIL` 만큼 — 날짜 그룹을 내려가는 길
 *
 * 경계는 `badgeWindowStartIso` 하나가 정한다. 여기서 따로 계산하면 세는 쪽과 어긋나서
 * "가져왔는데 안 세는" 글이 생긴다.
 */
export async function fetchFeedArticles(params: {
  /** 창의 왼쪽 끝. `badgeWindowStartIso(nowIso)` 가 만든 값. */
  windowStartIso: string | null;
  tail?: number;
}): Promise<FeedArticles> {
  const { windowStartIso, tail = FEED_TAIL } = params;
  const db = publicSupabase();

  // 창을 못 정하면(기준 시각이 깨졌다) 옛 동작으로 돌아간다 — 화면이 통째로 비는 것보다 낫다.
  //
  // **프로덕션 경로에는 이 가지가 없다** — 부르는 쪽이 `new Date().toISOString()` 을 넘기므로
  // `Date.parse` 가 NaN 이 될 수 없다. 그래도 흔적을 남긴다: 도달하면 뱃지 숫자가 작아지는데
  // 화면은 멀쩡해 보여서, 안 남기면 이 조회가 고치려던 "조용히 작아진다"로 되돌아간다.
  if (windowStartIso === null) {
    console.warn(
      `[feed] 창 시작을 못 정해 최신 ${tail}건으로 돌아간다 — 뱃지 건수가 실제보다 작다.`,
    );
    const { data, error } = await db
      .from("item")
      .select(LIST_COLUMNS)
      .order("published_at", { ascending: false })
      .limit(tail);
    if (error) throw new Error(`소식 목록 조회 실패: ${error.message}`);
    // 이 가지는 창을 못 정한 상태라 날짜 그룹의 완전성도 보장할 수 없다.
    // 마지막 그룹을 뱃지에서 빼는 것이 정직하다.
    const rows = parseRows(data);
    return { items: rows, partialDayKey: lastDayKeyOf(rows) };
  }

  const [inWindow, older] = await Promise.all([
    // `count: "exact"` 는 **서버가 센 총계**를 같이 받는다. 아래 잘림 판정의 근거다.
    db
      .from("item")
      .select(LIST_COLUMNS, { count: "exact" })
      .gte("published_at", windowStartIso)
      .order("published_at", { ascending: false }),
    db
      .from("item")
      .select(LIST_COLUMNS)
      .lt("published_at", windowStartIso)
      .order("published_at", { ascending: false })
      .limit(tail),
  ]);

  // 두 실패는 성질이 다르다 — 창 조회가 죽으면 뱃지 줄이 통째로 사라지고, 창 밖이 죽으면
  // 날짜 그룹만 짧아진다. 메시지를 갈라야 로그만 보고 어느 쪽인지 안다.
  if (inWindow.error) throw new Error(`소식 목록 조회 실패(창 안): ${inWindow.error.message}`);
  if (older.error) throw new Error(`소식 목록 조회 실패(창 밖): ${older.error.message}`);

  // **서버가 센 수보다 적게 받았으면 잘린 것이다.** 상한이 몇이든(그 값은 레포 밖에 있다)
  // 이 비교는 정확하다. 화면을 죽이지는 않는다 — 뱃지 숫자가 작아질 뿐 목록은 멀쩡하다.
  const received = (inWindow.data ?? []).length;
  if (typeof inWindow.count === "number" && inWindow.count > received) {
    console.warn(
      `[feed] 뱃지 창이 잘렸다 — 서버에 ${inWindow.count}건인데 ${received}건만 받았다. ` +
        `뱃지 건수가 실제보다 작게 나온다. 창을 좁히거나 집계를 DB 로 내릴 때다.`,
    );
  }

  // 두 조회는 경계로 갈려 있어 겹치는 행이 없다(`>=` 와 `<`).
  const windowRows = parseRows(inWindow.data);
  const tailRows = parseRows(older.data);

  // ── 창 밖 마지막 날짜를 통째로 채운다 (INV-R5, 2026-09-19 리뷰) ──────────
  //
  // 상한에 닿았다는 것은 **그 뒤에 더 있다**는 뜻이고, 그러면 마지막 날짜 그룹이
  // 한가운데에서 잘려 있다. 그 그룹에서 상위 N 을 뽑으면 "그 날의 상위"가 아니다.
  // 상한에 안 닿았으면 더 받을 것이 없으므로 그룹은 이미 완전하다.
  const hitLimit = (older.data ?? []).length >= tail;
  const lastKey = hitLimit ? lastDayKeyOf(tailRows) : null;
  if (lastKey === null) {
    return { items: [...windowRows, ...tailRows], partialDayKey: null };
  }

  const dayStart = dayStartIso(lastKey);
  if (dayStart === null) {
    // 날짜 키가 날짜 꼴이 아니다 — 채울 경계를 못 정한다. 그 그룹은 뱃지에서 뺀다.
    return { items: [...windowRows, ...tailRows], partialDayKey: lastKey };
  }

  const fill = await db
    .from("item")
    .select(LIST_COLUMNS, { count: "exact" })
    .gte("published_at", dayStart)
    .lt("published_at", windowStartIso)
    .order("published_at", { ascending: false })
    .limit(TAIL_DAY_CAP);

  if (fill.error) {
    // 목록은 멀쩡하다 — 그 하루의 뱃지만 포기한다. 목록을 죽이는 것보다 낫다.
    console.warn(
      `[feed] 마지막 날짜(${lastKey})를 못 채웠다: ${fill.error.message}. 그 날에는 뜨는 중을 안 붙인다.`,
    );
    return { items: [...windowRows, ...tailRows], partialDayKey: lastKey };
  }

  const fillRows = parseRows(fill.data);
  // 서버가 센 수보다 적게 받았으면 상한을 넘은 것이다 — 그 날은 끝내 완전해지지 않는다.
  const capped = typeof fill.count === "number" && fill.count > (fill.data ?? []).length;
  if (capped) {
    console.warn(
      `[feed] 마지막 날짜(${lastKey})가 ${fill.count}건이라 상한 ${TAIL_DAY_CAP} 을 넘었다. ` +
        `그 날에는 뜨는 중을 안 붙인다.`,
    );
  }

  // 그 날짜의 행은 채운 것으로 갈아 끼운다. 남겨 두면 같은 글이 두 번 들어간다.
  const rest = tailRows.filter((a) => dayKey(a.publishedAt) !== lastKey);
  return {
    items: [...windowRows, ...rest, ...fillRows],
    partialDayKey: capped ? lastKey : null,
  };
}

/** 목록에서 가장 오래된 항목의 날짜 키. 비었거나 날짜를 모르면 null. */
function lastDayKeyOf(rows: readonly StoredArticleListItem[]): string | null {
  const last = rows[rows.length - 1];
  if (last === undefined) return null;
  const key = dayKey(last.publishedAt);
  return key === "" ? null : key;
}

/** 상세 한 건. 없으면 null — 부르는 쪽이 404 로 처리한다. */
export async function fetchArticleById(id: string): Promise<StoredArticle | null> {
  const { data, error } = await publicSupabase()
    .from("item")
    .select(DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  // 없는 id 는 오류가 아니다. maybeSingle 은 0건일 때 data=null, error=null 을 준다.
  if (error) throw new Error(`소식 조회 실패: ${error.message}`);
  return data === null ? null : toStoredArticle(data);
}
