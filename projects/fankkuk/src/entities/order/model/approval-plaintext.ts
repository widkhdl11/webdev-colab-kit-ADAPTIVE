import { z } from "zod";
import { ITEM_CATEGORIES, ITEM_CATEGORY_LABEL } from "@/shared/config/item-category";
import { ORDER_NO_PATTERN } from "./order-no";

// approval-signature INV-S1 (2026-10-29): 서명 원문은 주문번호 · 보낸 팬 닉네임 · 선물 종류 · 개수 네 값으로만 이루어진다.
// 원문을 실제로 만드는 곳은 DB 의 원문 함수 하나다(approval_sign_plaintext — 서명 요청을 만들 때 주문에서 만든다). 이 파일은 같은 꼴을
// 읽고(송장 출력 재검증의 주문번호 대조, INV-P4 b) 시험에서 같은 글을 만든다. 칸 안에 줄바꿈이 들어오면 다른 줄을 꾸며 넣을 수 있어 받지 않는다.
// 원문은 카카오·드림시큐리티를 거치므로 주소·실명·연락처·팬이 쓴 글이 들어갈 칸이 없다.

const GIFT_KIND_LABELS = ITEM_CATEGORIES.map((c) => ITEM_CATEGORY_LABEL[c]) as [string, ...string[]];

const fieldsSchema = z
  .object({
    orderNo: z.string().regex(ORDER_NO_PATTERN),
    fanNickname: z
      .string()
      .min(1)
      .max(20)
      // 제어 문자(줄바꿈 포함) 금지 — DB 함수의 [[:cntrl:]] 검사와 같다
      .refine((s) => !/[\u0000-\u001f\u007f]/.test(s)),
    giftKind: z.enum(GIFT_KIND_LABELS),
    boxCount: z.number().int().min(1).max(10),
  })
  .strict();

export type ApprovalPlaintextFields = z.infer<typeof fieldsSchema>;

/** 네 값으로 원문을 만든다. 다른 칸이 섞이거나 꼴이 틀리면 던진다(S1b). */
export function buildApprovalPlaintext(fields: ApprovalPlaintextFields): string {
  const f = fieldsSchema.parse(fields);
  return `주문번호: ${f.orderNo}\n보낸 팬: ${f.fanNickname}\n선물 종류: ${f.giftKind}\n개수: ${f.boxCount}`;
}

const PATTERN = /^주문번호: ([^\n]+)\n보낸 팬: ([^\n]+)\n선물 종류: ([^\n]+)\n개수: ([0-9]{1,2})$/;

/** 원문을 칸으로 되돌린다. 꼴이 다르거나 줄이 더 있으면 null. */
export function parseApprovalPlaintext(text: string): ApprovalPlaintextFields | null {
  const m = PATTERN.exec(text);
  if (!m) return null;
  const parsed = fieldsSchema.safeParse({ orderNo: m[1], fanNickname: m[2], giftKind: m[3], boxCount: Number(m[4]) });
  return parsed.success ? parsed.data : null;
}
