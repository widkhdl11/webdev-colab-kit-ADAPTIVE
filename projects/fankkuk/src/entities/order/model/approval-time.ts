// 크리에이터의 평균 승인 시간. 파생 지표라 저장하지 않고 승인 기록에서 매번 계산한다.
// 승인 기록이 없으면 null — "0분"이라고 보여주면 팬이 금방 승인될 거라고 오해한다.
export function averageApprovalMinutes(records: ReadonlyArray<{ registeredAt: string; approvedAt: string | null }>): number | null {
  const durations = records
    .filter((r): r is { registeredAt: string; approvedAt: string } => r.approvedAt !== null)
    .map((r) => (Date.parse(r.approvedAt) - Date.parse(r.registeredAt)) / 60_000);
  if (durations.length === 0) return null;
  return Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
}
