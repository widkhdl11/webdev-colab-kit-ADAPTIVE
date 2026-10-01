import { z } from "zod";
import type { BillableTier } from "@/entities/payment/config/tier-pricing";

// 선물 등록 폼의 입력 경계. 폼은 문자열을 보내고, 여기서 한 번 검증해 상자 구간 목록·참거짓으로 바꾼다.
// 금액 칸은 받지 않는다 — 결제 금액은 서버 요금표로만 계산한다(INV-M1).
// 구간은 소형·중형 둘뿐이다. 중형을 넘는 상자는 받지 않는다(결제 스펙, 사용자 결정 d8).

/** 한 번에 등록하는 상자 수 상한 (가정). 주문번호 뒤 번호가 두 자리까지라 99가 형식상 끝이지만, 한 팬이 한 번에 보내는 양으로는 10이면 넉넉하다. */
export const MAX_BOX_COUNT = 10;

const count = z
  .string()
  .regex(/^[0-9]+$/, "상자 수를 숫자로 적어 주세요.")
  .transform(Number);

export const registerFormSchema = z
  .object({
    creatorId: z.string().min(1, "선물을 받을 크리에이터를 골라 주세요."),
    itemKind: z.string().trim().min(1, "어떤 선물인지 적어 주세요.").max(30, "30자 안으로 적어 주세요."),
    smallCount: count,
    mediumCount: count,
    electronicsOrMetal: z.enum(["yes", "no"], { message: "전자기기나 금속 제품이 들어 있는지 골라 주세요." }),
  })
  .superRefine((v, ctx) => {
    const total = v.smallCount + v.mediumCount;
    if (total === 0) ctx.addIssue({ code: "custom", path: ["smallCount"], message: "상자를 하나 이상 골라 주세요." });
    if (total > MAX_BOX_COUNT) {
      ctx.addIssue({ code: "custom", path: ["smallCount"], message: `상자는 모두 합쳐 ${MAX_BOX_COUNT}개까지 한 번에 등록할 수 있어요.` });
    }
  });

export type RegisterFormValues = z.input<typeof registerFormSchema>;
export type RegisterFormOutput = z.output<typeof registerFormSchema>;

export type RegisterInput = {
  creatorId: string;
  itemKind: string;
  boxes: BillableTier[];
  hasElectronicsOrMetal: boolean;
};

export type RegisterParseResult =
  | { success: true; data: RegisterInput }
  | { success: false; errors: Partial<Record<keyof RegisterFormValues, string>> };

/** 상자 수 두 칸 → 구간 목록(소형 먼저). 폼 화면의 요금 줄과 서버 결제가 같은 목록을 쓴다. */
export function boxesFromCounts(smallCount: number, mediumCount: number): BillableTier[] {
  return [...Array<BillableTier>(smallCount).fill("small"), ...Array<BillableTier>(mediumCount).fill("medium")];
}

const FIELDS = ["creatorId", "itemKind", "smallCount", "mediumCount", "electronicsOrMetal"] as const;

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
  const { creatorId, itemKind, smallCount, mediumCount, electronicsOrMetal } = parsed.data;
  return {
    success: true,
    data: { creatorId, itemKind, boxes: boxesFromCounts(smallCount, mediumCount), hasElectronicsOrMetal: electronicsOrMetal === "yes" },
  };
}
