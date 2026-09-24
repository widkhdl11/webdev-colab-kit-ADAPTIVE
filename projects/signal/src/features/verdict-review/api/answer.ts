import { z } from "zod";
import type { AnswerResult, ReviewStore } from "./review-store";

/**
 * 답 하나 (INV-VR3·VR9). 화면의 서버 액션이 부른다.
 *
 * 입력은 남이 보낸 값이다 — 서버 액션은 화면이 404 여도 직접 POST 로 부를 수 있다(Next 문서
 * 「Data Security」). 그래서 여기서 모양을 전부 검사하고, 이 PC 의 개발 서버가 아니면 무조건 거부한다.
 * 닫혔나·방향이 판정에 맞나는 DB 함수가 한 트랜잭션에서 다시 본다 — 여기 검사는 모양뿐이다.
 */

const WEEK_RE = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;

const inputSchema = z
  .object({
    week: z.string().regex(WEEK_RE),
    itemId: z.string().uuid(),
    answer: z.enum(["correct", "wrong", "unsure"]),
    direction: z.enum(["should_be_hot", "should_not_be_hot", "wrong_reason"]).optional(),
  })
  .strict();

export async function answerVerdict(
  store: ReviewStore,
  raw: unknown,
  env: { isLocal: boolean },
): Promise<AnswerResult> {
  // 관리자 로그인이 없다 — 이 PC 의 개발 서버, 이 PC 의 주소가 아니면 아무도 못 쓴다(PRODUCT.md, INV-VR9)
  if (!env.isLocal) return { ok: false, error: "forbidden" };
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "bad_input" };
  const { week, itemId, answer, direction } = parsed.data;
  if (answer !== "wrong" && direction !== undefined) return { ok: false, error: "bad_direction" };
  return store.answer(week, itemId, answer, direction ?? null);
}
