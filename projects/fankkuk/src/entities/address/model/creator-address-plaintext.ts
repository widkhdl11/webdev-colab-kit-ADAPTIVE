import { z } from "zod";

// INV-P13: 크리에이터 주소는 크리에이터 브라우저에서 봉인된 뒤에만 서버로 간다(INV-P1). 봉인하는 내용에는
// 택배 라벨에 필요한 값(받는 사람 이름·전화번호·주소)과 그 크리에이터의 식별값(creators.id)이 함께 들어간다 —
// 식별값이 같이 묶여 있어야 서버를 장악한 사람이 한 크리에이터의 암호문을 다른 크리에이터 칸에 옮겨 붙여도
// 송장 출력 때 걸린다(INV-P14, 연 뒤 대조는 송장 출력 단계에서 한다).

const text = (max: number) => z.string().trim().min(1).max(max);

const plaintextSchema = z
  .object({
    v: z.literal(1),
    creatorId: z.string().uuid(),
    recipientName: text(30),
    phone: z.string().regex(/^01[016789][0-9]{7,8}$/),
    zipCode: z.string().regex(/^[0-9]{5}$/),
    address1: text(120),
    address2: z.string().trim().max(120),
  })
  .strict();

export type CreatorAddressInput = Omit<z.infer<typeof plaintextSchema>, "v">;

/** 봉인할 평문을 만든다. 칸이 하나라도 틀리면 만들지 않는다(브라우저에서 부른다). */
export function creatorAddressPlaintext(input: CreatorAddressInput): string {
  return JSON.stringify(plaintextSchema.parse({ v: 1, ...input }));
}

/** 택배 라벨에 찍는 칸 — 송장 출력이 화면(인쇄)으로 넘기는 것은 이 다섯 칸뿐이다(INV-P10: 식별값·암호문은 빠진다). */
export type CreatorAddressLabel = Omit<CreatorAddressInput, "creatorId">;

/** 연 평문을 크리에이터 식별값과 라벨 칸으로 나눈다. 꼴이 틀리면 null — 송장 출력이 그 내용을 쓰지 않는다(INV-P14). */
export function readOpenedCreatorAddress(plaintext: string): { creatorId: string; label: CreatorAddressLabel } | null {
  let raw: unknown;
  try {
    raw = JSON.parse(plaintext);
  } catch {
    return null;
  }
  const parsed = plaintextSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { v: _v, creatorId, ...label } = parsed.data;
  return { creatorId, label };
}
