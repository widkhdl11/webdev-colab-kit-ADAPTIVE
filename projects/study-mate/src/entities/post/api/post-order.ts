/**
 * 목록의 정렬 어휘와 규칙 — 조회 코드와 통합 검사가 **같은 값**을 쓰게 하려고 따로 둔다.
 *
 * 여기 있는 이유: 「마감 임박순」이 오류 하나 없이 uuid 순으로 나오고 있었다.
 * `order(..., { referencedTable: "study" })` 는 임베드된 자원 **안쪽**을 정렬하는데,
 * 스터디는 모집글 하나에 하나뿐이라 아무 일도 하지 않았다. 화면은 「마감 임박순」이라고
 * 적힌 채 그럴듯하게 틀렸다 — **화면을 봐도 모르는 종류라** 검사가 붙들어야 한다.
 *
 * 검사는 이 표를 그대로 읽어 실제 질의를 보낸다. 값을 옛날 것으로 되돌리면 빨간불이 난다.
 */

/** 목록 정렬 셋. 「마감 임박순」의 기준은 모집 마감일이다 (docs/IA.md) */
export const SORTS = ["latest", "deadline", "likes"] as const;
export type Sort = (typeof SORTS)[number];

export const SORT_LABEL: Readonly<Record<Sort, string>> = {
  latest: "최신순",
  deadline: "마감 임박순",
  likes: "좋아요순",
};

/**
 * 주소창의 `?sort=` 를 정렬 어휘로 좁힌다. 어휘 밖이면 최신순.
 *
 * **여기 있는 이유는 검사다.** 원래는 `read-posts.ts` 에 있었는데 그 파일은 요청 맥락에
 * 붙은 서버 클라이언트를 모듈 수준에서 끌어와 검사가 부를 수 없었고, 그래서 이 함수는
 * 아무 검사에도 안 붙들려 있었다(변이 `sort-whitelist-dropped` 가 빠져나갔다).
 */
export function toSort(value: string | undefined): Sort {
  return SORTS.includes(value as Sort) ? (value as Sort) : "latest";
}

export type OrderOptions = { ascending: boolean; nullsFirst?: boolean; referencedTable?: string };
export type OrderKey = { readonly column: string; readonly options: OrderOptions };

/**
 * 정렬마다 키가 배열이다. 지금은 전부 하나지만 모양을 맞춰 둔다 — 소비하는 쪽에
 * 「하나인가 여럿인가」 분기를 만들지 않기 위해서다.
 *
 * 마감일은 스터디에 있고 정렬 대상은 모집글이라, 0007·0008 이 그 값을 모집글 쪽 계산
 * 컬럼으로 낸다.
 */
export const SORT_ORDER: Readonly<Record<Sort, readonly OrderKey[]>> = {
  latest: [{ column: "created_at", options: { ascending: false } }],
  likes: [{ column: "likes_count", options: { ascending: false } }],
  // 0008 의 순위 하나가 세 덩어리(안 지난 마감일 → 기한 없음 → 지난 마감일)와 각 덩어리
  // **안의 방향**까지 정한다. 키를 둘로 나누면 「지났다」 쪽만 뒤집을 수 없다 —
  // PostgREST 는 키마다 방향이 하나씩이기 때문이다. 그 함수는 null 을 내지 않으므로
  // null 처리도 걸지 않는다.
  deadline: [{ column: "study_deadline_rank", options: { ascending: true } }],
};

/**
 * 같은 값일 때 순서를 고정하는 마지막 키. 없으면 쪽을 넘길 때 같은 글이 두 번 나온다.
 * 정렬마다 다른 값이 아니라 **모든 정렬에 붙는 것**이라 위 표 밖에 둔다.
 */
export const TIEBREAK_ORDER: OrderKey = {
  column: "id",
  options: { ascending: true },
};
