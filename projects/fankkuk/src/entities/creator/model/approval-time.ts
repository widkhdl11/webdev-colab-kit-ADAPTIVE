// 크리에이터 한 사람의 평균 승인 시간(분) — 선물 보내기·크리에이터 찾기·크리에이터 페이지·팔로우 목록이 모두 이 값을 쓴다.
// 주문 기록으로 계산한 평균(entities/order 의 averageApprovalMinutes)이 있으면 그것, 없으면 소개 칸에 적힌 시간.
// 둘 다 없으면 null — "0분"이라고 보여주면 팬이 금방 승인될 거라고 오해한다.
export function approvalTimeOf(fromOrdersMinutes: number | null, profileHours: number | undefined): number | null {
  if (fromOrdersMinutes !== null) return fromOrdersMinutes;
  return profileHours === undefined ? null : profileHours * 60;
}
