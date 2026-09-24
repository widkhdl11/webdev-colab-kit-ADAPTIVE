"use server";

import { fetchReviewItems, fetchReviewWeek } from "@/entities/verdict-review/api/review-queries";
import { answerVerdict, type AnswerActionResult } from "@/features/verdict-review";
import { createReviewStore } from "@/features/verdict-review/api/supabase-store";
import { localDevOnly } from "../../local-guard";

/**
 * 판정 검토의 답 하나 (verdict-review INV-VR3·VR9).
 *
 * **서버 액션은 화면이 404 여도 직접 POST 로 부를 수 있다**(Next 「Data Security」 — "treat Server
 * Actions as reachable via direct POST requests and verify ... inside each one"). 그래서 화면의 가드에
 * 기대지 않고 여기서 배포 환경을 다시 거부한다. 다른 출처의 요청은 Next 가 Origin·Host 비교로 막는다.
 * 입력 검사는 answerVerdict 가, 닫혔나·방향은 DB 함수가 한 트랜잭션에서 한다.
 */
export async function answerVerdictAction(raw: unknown): Promise<AnswerActionResult> {
  // 배포본(NODE_ENV·Vercel), 같은 와이파이의 다른 기기, DNS 재바인딩한 주소 — 셋 다 여기서 막는다.
  // Next 의 Origin·Host 비교는 둘이 같은지만 봐서 재바인딩을 못 막는다(shared/lib/local-dev.ts).
  const isLocal = await localDevOnly();
  if (!isLocal) return { ok: false, error: "forbidden" };
  const r = await answerVerdict(createReviewStore(), raw, { isLocal });
  if (!r.ok) return r;
  // answerVerdict 가 모양을 통과시켰으니 week 는 주차 문자열이다
  const week = (raw as { week: string }).week;
  const [w, items] = await Promise.all([fetchReviewWeek(week), fetchReviewItems(week)]);
  if (!w) return { ok: false, error: "no_week" };
  return { ok: true, week: w, items };
}
