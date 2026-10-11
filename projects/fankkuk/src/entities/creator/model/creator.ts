// 크리에이터의 저장 모양. DB 읽기(api/creator-reads)가 이 모양으로 바꿔 넘긴다.

/** 기본 정보 — 주문 기록이 creatorId 로 읽는다. */
export type CreatorSummary = { id: string; name: string; channel: string };

/** 목록·크리에이터 페이지에 보이는 소개 칸. CreatorSummary 와 id 로 잇는다. */
export type CreatorProfile = {
  creatorId: string;
  /** 태그 — 숨기지 않은 선택지 이름, 선택지 순서(creator-tags INV-T4). 직접 입력은 공개 목록에 오지 않는다. */
  tags: readonly string[];
  channelTitle: string;
  intro: string;
  /** 검색에 같이 걸리는 로마자 이름. */
  alias: string;
  /** 소개 칸에 적힌 평균 승인 시간(시간 단위). 주문 기록으로 계산한 값이 있으면 그쪽을 쓴다(approvalTimeOf). 새 크리에이터는 null. */
  avgApprovalHours: number | null;
  /** 얼굴 자리표시 동그라미 색 — 프로필 사진이 붙으면 사라질 값이라 토큰이 아니라 데이터로 둔다. */
  faceTone: string;
  /** 링크용 아이디(creator-link INV-E2) — 없으면 null. 목록·페이지의 링크 주소를 정한다(INV-E5). */
  handle?: string | null;
  /** 프로필 사진의 공개 저장소 경로({크리에이터 ID}/{판}.webp) — 없으면 null(INV-E9). */
  photoPath?: string | null;
};
