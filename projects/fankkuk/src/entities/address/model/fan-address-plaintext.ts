import { z } from "zod";

// INV-P17: 팬 받을 주소는 팬 브라우저에서 봉인된 뒤에만 서버로 간다(INV-P1). 봉인하는 내용에는
// 택배 라벨에 필요한 값(받는 사람 이름·전화번호·주소)과 그 팬의 계정 식별값(profiles.id)이 함께 들어간다.
// 등록 주소는 받기 때마다 여러 역조공 몫에 복사되므로 주문번호 대신 계정을 묶는다(reverse-gift INV-R5, 2026-10-17).
// 송장 출력이 연 뒤 이 계정을 그 몫의 받는 팬과 대조한다(INV-R7 b) — 다른 팬의 암호문을 옮겨 붙이면 걸린다.

const text = (max: number) => z.string().trim().min(1).max(max);

const plaintextSchema = z
  .object({
    v: z.literal(1),
    accountId: z.string().uuid(),
    recipientName: text(30),
    phone: z.string().regex(/^01[016789][0-9]{7,8}$/),
    zipCode: z.string().regex(/^[0-9]{5}$/),
    address1: text(120),
    address2: z.string().trim().max(120),
  })
  .strict();

export type FanAddressInput = Omit<z.infer<typeof plaintextSchema>, "v">;

/** 택배 라벨에 찍는 칸 — 송장 출력이 화면(인쇄)으로 넘기는 것은 이 다섯 칸뿐이다(INV-P10: 식별값·암호문은 빠진다). */
export type FanAddressLabel = Omit<FanAddressInput, "accountId">;

/** 봉인할 평문을 만든다. 칸이 하나라도 틀리면 만들지 않는다(브라우저에서 부른다). */
export function fanAddressPlaintext(input: FanAddressInput): string {
  return JSON.stringify(plaintextSchema.parse({ v: 1, ...input }));
}

/** 연 평문을 계정 식별값과 라벨 칸으로 나눈다. 꼴이 틀리면 null — 송장 출력이 그 내용을 쓰지 않는다(INV-R7 b). */
export function readOpenedFanAddress(plaintext: string): { accountId: string; label: FanAddressLabel } | null {
  let raw: unknown;
  try {
    raw = JSON.parse(plaintext);
  } catch {
    return null;
  }
  const parsed = plaintextSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { v: _v, accountId, ...label } = parsed.data;
  return { accountId, label };
}
