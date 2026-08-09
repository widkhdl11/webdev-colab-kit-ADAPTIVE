import { publicSupabase } from "@/shared/api/supabase-public";
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
const LIST_COLUMNS =
  "id, original_url, title, summary, source_excerpt, summary_points, source_id, source_name, published_at, item_tag(tag(name))";

const DETAIL_COLUMNS = `${LIST_COLUMNS}, content_html`;

/**
 * 피드에 그릴 목록. 날짜 그룹·정렬·개수 제한은 화면 쪽(selectFeed)이 하므로
 * 여기서는 최근 것부터 넉넉히 가져온다.
 *
 * 랭킹으로 정렬해서 가져올 수는 없다 — 점수가 DB 에 없기 때문이다(INV-R1).
 * 그래서 발행시각 기준으로 자르고, 점수 정렬은 그 안에서 한다. 자르는 창이 좁으면
 * 오래됐지만 weight 높은 글이 밀려날 수 있어서 창을 넉넉히 잡는다.
 */
export async function fetchArticleList(limit = 200): Promise<StoredArticleListItem[]> {
  const { data, error } = await publicSupabase()
    .from("item")
    .select(LIST_COLUMNS)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`소식 목록 조회 실패: ${error.message}`);

  // 경계를 통과 못 한 행은 버린다. 한 건이 빠지는 것과 목록이 통째로 사라지는 것은 다르다.
  return (data ?? [])
    .map(toListItemRow)
    .filter((a): a is StoredArticleListItem => a !== null);
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
