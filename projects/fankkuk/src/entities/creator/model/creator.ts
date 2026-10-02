// 크리에이터의 저장 모양. DB 읽기(api/creator-reads)가 이 모양으로 바꿔 넘긴다.

/** 기본 정보 — 주문 기록이 creatorId 로 읽는다. */
export type CreatorSummary = { id: string; name: string; channel: string };

/** 목록·크리에이터 페이지에 보이는 소개 칸. CreatorSummary 와 id 로 잇는다. */
export type CreatorProfile = {
  creatorId: string;
  category: string;
  channelTitle: string;
  intro: string;
  /** 검색에 같이 걸리는 로마자 이름. */
  alias: string;
  /** 소개 칸에 적힌 평균 승인 시간(시간 단위). 주문 기록으로 계산한 값이 있으면 그쪽을 쓴다(approvalTimeOf). */
  avgApprovalHours: number;
  /** 얼굴 자리표시 동그라미 색 — 프로필 사진이 붙으면 사라질 값이라 토큰이 아니라 데이터로 둔다. */
  faceTone: string;
};
