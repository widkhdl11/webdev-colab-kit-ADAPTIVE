import type { Slot } from "@/shared/lib/schedule";

/**
 * 카드 한 장이 보여주는 만큼의 모집글. 상세 화면이 쓰는 본문·작성자는 여기 없다 —
 * 목록에서 안 쓰는 것을 넣으면 목록 질의가 그만큼 무거워진다.
 *
 * 모집글은 항상 스터디 하나에 붙어 있고, 카드가 보여주는 판단 재료(카테고리·지역·
 * 자리·모집 상태)는 전부 그 스터디 쪽 값이다. 그래서 `study` 를 안고 있다.
 */
export type PostSummary = {
  readonly id: string;
  readonly title: string;
  readonly summary: string | null;
  readonly createdAt: string;
  readonly viewsCount: number;
  readonly likesCount: number;
  readonly study: StudySummary;
};

export type StudySummary = {
  readonly id: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly region: string;
  /** 정원 */
  readonly capacity: number;
  /** 수락된 인원. 저장된 값이 아니라 센 값이다 (INV-P6) */
  readonly filled: number;
  /** 모집 중 = 호스트가 닫지 않았고 + 수락 인원 < 정원 (INV-P6) */
  readonly recruiting: boolean;
  readonly slots: readonly Slot[];
};
