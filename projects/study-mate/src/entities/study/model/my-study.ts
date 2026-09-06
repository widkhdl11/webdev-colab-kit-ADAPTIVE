/** 프로필의 「내가 만든 스터디」 한 줄 */
export type MyStudy = {
  readonly id: string;
  readonly title: string;
  readonly categoryId: string;
  readonly categoryName: string;
  /** 정원 */
  readonly capacity: number;
  /** 수락된 인원. 저장된 값이 아니라 데이터베이스가 센 값이다 (INV-P2) */
  readonly filled: number;
  /** 호스트가 닫지 않았고 + 수락 인원 < 정원 (INV-P6) */
  readonly recruiting: boolean;
};

/**
 * 모집글을 새로 쓸 수 있는 상태인가. 화면이 「모집글을 써 보세요」를 띄울지 정하는 판정이다.
 *
 * **조건은 「내 스터디가 있다」가 아니라 「모집 중인 내 스터디가 있다」다** (INV-Z14,
 * 강제 위치는 `posts_insert_author` 의 `private.study_is_recruiting`). 앞엣것으로 판단하면
 * 스터디가 전부 마감인 사람에게 링크가 뜨고, 눌러 가면 작성 화면이 "지금 고를 수 있는
 * 스터디가 없습니다"로 받는다 — 링크가 막다른 길을 가리킨다.
 */
export function canOpenPost(studies: readonly MyStudy[]): boolean {
  return studies.some((s) => s.recruiting);
}
