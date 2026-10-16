import { z } from "zod";
import { REVGIFT_ORDER_NO_PATTERN } from "./revgift-order-no";

// INV-R5 (2026-10-17 전): 받기 때마다 주소를 입력하던 때의 봉인 — 택배 라벨에 필요한 값(받는 사람 이름·전화번호·주소)과
// 그 몫의 주문번호가 함께 들어 있다. 지금은 받기 때 팬 등록 주소(계정이 묶인 봉인, entities/address/model/fan-address-plaintext)를
// 몫에 복사하므로 새로 만들지 않는다. 그 전에 받기를 한 몫은 이 꼴 그대로 열린다(INV-R7 b — 주문번호 대조).
// 만드는 함수는 시험이 옛 몫을 재현할 때만 쓴다.

const text = (max: number) => z.string().trim().min(1).max(max);

const plaintextSchema = z
  .object({
    v: z.literal(1),
    orderNo: z.string().regex(REVGIFT_ORDER_NO_PATTERN),
    recipientName: text(30),
    phone: z.string().regex(/^01[016789][0-9]{7,8}$/),
    zipCode: z.string().regex(/^[0-9]{5}$/),
    address1: text(120),
    address2: z.string().trim().max(120),
  })
  .strict();

export type RevgiftAddressInput = Omit<z.infer<typeof plaintextSchema>, "v">;

/** 봉인할 평문을 만든다. 칸이 하나라도 틀리면 만들지 않는다(브라우저에서 부른다). */
export function sealedAddressPlaintext(input: RevgiftAddressInput): string {
  return JSON.stringify(plaintextSchema.parse({ v: 1, ...input }));
}

/** 택배 라벨에 찍는 칸 — 송장 출력이 화면(인쇄)으로 넘기는 것은 이 다섯 칸뿐이다(주문번호·암호문은 빠진다). */
export type RevgiftAddressLabel = Omit<RevgiftAddressInput, "orderNo">;

/** 연 평문을 주문번호와 라벨 칸으로 나눈다. 꼴이 틀리면 null — 송장 출력이 그 내용을 쓰지 않는다(INV-R7 b). */
export function readOpenedRevgiftAddress(plaintext: string): { orderNo: string; label: RevgiftAddressLabel } | null {
  let raw: unknown;
  try {
    raw = JSON.parse(plaintext);
  } catch {
    return null;
  }
  const parsed = plaintextSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { orderNo, recipientName, phone, zipCode, address1, address2 } = parsed.data;
  return { orderNo, label: { recipientName, phone, zipCode, address1, address2 } };
}
