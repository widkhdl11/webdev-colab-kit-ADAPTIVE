// 크리에이터 확인 (2026-10-12 (2) 문제집 D3 ②, office-workflow INV-W4·W6·W13).
// 블루투스·RF 반응이 나왔지만 직원이 위치 추적기가 아니라고 판정한 팬 선물 상자는 바로 통과하지 않고 크리에이터에게 받을지 묻는다.
// 크리에이터의 답은 「선택」으로만 남고(INV-W13), 운영자가 처리하거나 기한이 지나야 상자가 움직인다.
// 검수 완료 스캔부터 이 날수(168시간) 안에 운영자가 처리하지 않으면 자동 처리가 고른 쪽대로(고른 것이 없으면 반송 대기로) 닫는다 —
// DB(office_run_expiry·choose_creator_check·cancel_creator_check)가 같은 기한을 쓴다. 목록은 크리에이터 처리할 일의 블루투스 발견 줄이다(action-center INV-J5).
export const CREATOR_CHECK_DAYS = 7;

/** 반응이 나온 신호 이름 — 「블루투스」, 「무선(RF)」, 둘 다면 「블루투스·무선(RF)」 */
export function detectedSignalText(v: { bluetooth: boolean; rf: boolean }): string {
  const parts = [v.bluetooth ? "블루투스" : null, v.rf ? "무선(RF)" : null].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join("·") : "무선";
}

/** 고를 기한이 지났는가 — 지났으면 고르기·취소 버튼을 두지 않는다. DB 도 기한 시각 정각부터 받지 않는다(INV-W6·W13). */
export function isCreatorCheckDeadlinePassed(dueAt: string, now: string): boolean {
  return Date.parse(dueAt) <= Date.parse(now);
}
