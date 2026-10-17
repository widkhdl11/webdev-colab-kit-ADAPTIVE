import { z } from "zod";

// 자동 처리(office_run_expiry)가 돌려주는 집계의 꼴과 결과 한 줄. 서버(run-expiry)와 화면(지금 돌리기 창)이 같이 쓴다.

export const expiryCounts = z.object({
  gifts: z.number().int(),
  unmatched: z.number().int(),
  differences: z.number().int(),
  revgifts: z.number().int(),
  // 24시간 지난 결제 대기를 닫은 수(payment INV-M15 · reverse-gift INV-R15)
  pending_gifts: z.number().int(),
  pending_revgifts: z.number().int(),
  // 크리에이터 확인 대기 상자 중 168시간 안에 답이 없어 반송 대기로 넘긴 수(office-workflow INV-W6, 2026-10-12 (2) D3 ②)
  held: z.number().int(),
  // 반송 주소를 30일 확인하지 않아 처분 대상으로 바꾼 상자 수 · 14일 재알림을 쌓은 상자 수(office-workflow INV-W15)
  dispose_due: z.number().int(),
  return_reminders: z.number().int(),
});

/** 지금 돌리기 결과 한 줄 — 운영자 화면 표기(용어집 dispose_due 「처분 대상」). 답의 꼴이 다르면 null */
export function expiryRunSummary(body: unknown): string | null {
  const parsed = z.object({ counts: expiryCounts }).safeParse(body);
  if (!parsed.success) return null;
  const c = parsed.data.counts;
  return `처분 대상 ${c.dispose_due}건 · 재알림 ${c.return_reminders}건`;
}
