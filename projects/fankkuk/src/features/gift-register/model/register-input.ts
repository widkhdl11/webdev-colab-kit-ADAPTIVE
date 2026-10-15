import { z } from "zod";
import type { PricedTier } from "@/entities/payment/model/price-table";
import { ANNIVERSARY_NAME_MAX } from "@/entities/creator/model/receiving";
import { charCount } from "@/shared/lib/validation/char-count";
import { forcesMetalReport, ITEM_CATEGORIES, ITEM_OTHER_MAX, type ItemCategory } from "@/entities/gift-item/model/item-category";
import { giftMemoOf, MEMO_BODY_MAX, MEMO_TITLE_MAX, type GiftMemo } from "@/entities/order/model/gift-memo";

// 선물 등록 폼의 입력 경계. 폼은 문자열을 보내고, 여기서 한 번 검증해 상자 구간 목록·참거짓으로 바꾼다.
// 금액 칸은 받지 않는다 — 결제 금액은 서버 요금표로만 계산한다(INV-M1).
// 구간은 소형·중형·대형 셋이다. 대형을 넘는 상자는 받지 않는다(admin-console INV-K6).

/** 한 번에 등록하는 상자 수 상한 (가정). 주문번호 뒤 번호가 두 자리까지라 99가 형식상 끝이지만, 한 팬이 한 번에 보내는 양으로는 10이면 넉넉하다. */
export const MAX_BOX_COUNT = 10;

const count = z
  .string()
  .regex(/^[0-9]+$/, "상자 수를 숫자로 적어 주세요.")
  .transform(Number);

export const registerFormSchema = z
  .object({
    // 크리에이터 id 는 DB 의 uuid — 꼴이 다르면 고르지 않은 것과 같다(DB 형식 오류가 서버 오류로 번지지 않게)
    creatorId: z.string().uuid("선물을 받을 크리에이터를 골라 주세요."),
    // hard-items INV-H1: 물품 종류는 고정 목록에서 고른다. 기타만 30자까지 직접 적는다(아래 superRefine)
    itemCategory: z.enum(ITEM_CATEGORIES, { message: "선물 종류를 골라 주세요." }),
    itemOther: z.string().trim().optional(),
    smallCount: count,
    mediumCount: count,
    largeCount: count,
    electronicsOrMetal: z.enum(["yes", "no"], { message: "전자기기나 금속 제품이 들어 있는지 골라 주세요." }),
    // creator-receiving INV-B9: 「{기념일} 선물」 표시 — 고른 기념일 이름. 7일 안인지는 DB 가 그날 다시 계산한다
    // 길이는 글자 수(코드 포인트)로 센다 — DB char_length 와 같은 기준(INV-B7)
    anniversaryName: z
      .string()
      .trim()
      .refine((s) => charCount(s) >= 1 && charCount(s) <= ANNIVERSARY_NAME_MAX)
      .optional(),
    // together INV-F7: 나만 보는 메모 — 둘 다 선택. 앞뒤 공백을 빼고 글자 수(코드 포인트)로 센다. 이름은 한 줄이다.
    // 물품 이름(itemOther)과 다른 칸이다 — 물품 이름은 크리에이터에게 가고, 메모는 보낸 팬만 본다
    memoTitle: z
      .string()
      .trim()
      .refine((s) => charCount(s) <= MEMO_TITLE_MAX, `선물 이름은 ${MEMO_TITLE_MAX}자 안으로 적어 주세요.`)
      .refine((s) => !/[\r\n]/.test(s), "선물 이름은 한 줄로 적어 주세요.")
      .optional(),
    memoBody: z
      .string()
      .trim()
      .refine((s) => charCount(s) <= MEMO_BODY_MAX, `내용은 ${MEMO_BODY_MAX}자 안으로 적어 주세요.`)
      .optional(),
  })
  .superRefine((v, ctx) => {
    // 기타 글 길이는 글자 수(코드 포인트)로 센다 — DB char_length 와 같은 기준
    if (v.itemCategory === "other") {
      const n = charCount(v.itemOther ?? "");
      if (n === 0) ctx.addIssue({ code: "custom", path: ["itemOther"], message: "어떤 선물인지 적어 주세요." });
      else if (n > ITEM_OTHER_MAX) ctx.addIssue({ code: "custom", path: ["itemOther"], message: `${ITEM_OTHER_MAX}자 안으로 적어 주세요.` });
    }
    const total = v.smallCount + v.mediumCount + v.largeCount;
    if (total === 0) ctx.addIssue({ code: "custom", path: ["smallCount"], message: "상자를 하나 이상 골라 주세요." });
    if (total > MAX_BOX_COUNT) {
      ctx.addIssue({ code: "custom", path: ["smallCount"], message: `상자는 모두 합쳐 ${MAX_BOX_COUNT}개까지 한 번에 등록할 수 있어요.` });
    }
  });

export type RegisterFormValues = z.input<typeof registerFormSchema>;
export type RegisterFormOutput = z.output<typeof registerFormSchema>;

export type RegisterInput = {
  creatorId: string;
  itemCategory: ItemCategory;
  /** 기타일 때만 팬이 적은 글. 다른 종류면 null(DB 가 종류 이름을 물품 이름으로 적는다) */
  itemOther: string | null;
  boxes: PricedTier[];
  hasElectronicsOrMetal: boolean;
  anniversaryName: string | null;
  /** 받기 어려운 품목 안내가 뜬 품목(metrics INV-Q5) — 화면이 보낸 값. 맞는지는 DB 등록 함수가 그때의 설정과 다시 맞춰 본다 */
  hardNoticeCategory: ItemCategory | null;
  /** 나만 보는 메모(together INV-F7) — 둘 다 비면 null. 물품 이름(itemOther)을 채우지 않는다 */
  memo: GiftMemo | null;
};

export type RegisterParseResult =
  | { success: true; data: RegisterInput }
  | { success: false; errors: Partial<Record<keyof RegisterFormValues, string>> };

/** 상자 수 세 칸 → 구간 목록(소형·중형·대형 순). 폼 화면의 요금 줄과 서버 결제가 같은 목록을 쓴다. */
export function boxesFromCounts(counts: Readonly<Record<PricedTier, number>>): PricedTier[] {
  return [
    ...Array<PricedTier>(counts.small).fill("small"),
    ...Array<PricedTier>(counts.medium).fill("medium"),
    ...Array<PricedTier>(counts.large).fill("large"),
  ];
}

// metrics INV-Q5: 안내가 뜬 품목은 측정용이다 — 목록 밖 값·꼴이 틀린 값은 버리고(null) 등록은 막지 않는다
const noticeSchema = z.object({ hardNoticeCategory: z.enum(ITEM_CATEGORIES) });

const FIELDS = ["creatorId", "itemCategory", "itemOther", "smallCount", "mediumCount", "largeCount", "electronicsOrMetal", "anniversaryName", "memoTitle", "memoBody"] as const;

/** 서버 쪽 등록 처리(DB 연결 때)가 쓰는 경계 — 폼은 같은 스키마를 zodResolver 로 쓴다. 브라우저 검증만 믿지 않는다. */
export function parseRegisterInput(input: unknown): RegisterParseResult {
  const parsed = registerFormSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Partial<Record<keyof RegisterFormValues, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = FIELDS.find((f) => f === issue.path[0]);
      if (key && !(key in errors)) errors[key] = issue.message;
    }
    return { success: false, errors };
  }
  const { creatorId, itemCategory, itemOther, smallCount, mediumCount, largeCount, electronicsOrMetal, anniversaryName, memoTitle, memoBody } = parsed.data;
  return {
    success: true,
    data: {
      creatorId,
      itemCategory,
      itemOther: itemCategory === "other" ? (itemOther ?? null) : null,
      boxes: boxesFromCounts({ small: smallCount, medium: mediumCount, large: largeCount }),
      // INV-H2: 전자기기를 고르면 신고를 켠다(DB 등록 함수도 켠다)
      hasElectronicsOrMetal: electronicsOrMetal === "yes" || forcesMetalReport(itemCategory),
      anniversaryName: anniversaryName ?? null,
      hardNoticeCategory: noticeSchema.safeParse(input).data?.hardNoticeCategory ?? null,
      memo: giftMemoOf(memoTitle, memoBody),
    },
  };
}
