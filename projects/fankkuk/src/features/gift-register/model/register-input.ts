import { z } from "zod";

// 선물 등록 폼의 입력 경계. 폼은 문자열을 보내고, 여기서 한 번 검증해 숫자·참거짓으로 바꾼다.
// 금액 칸은 받지 않는다 — 결제 금액은 서버 설정으로만 계산한다(INV-M1).

/** 상자 수 상한 (가정). 주문번호 뒤 번호가 두 자리까지라 99가 형식상 끝이지만, 한 팬이 한 번에 보내는 양으로는 10이면 넉넉하다. */
export const MAX_BOX_COUNT = 10;

export const registerFormSchema = z.object({
  creatorId: z.string().min(1, "선물을 받을 크리에이터를 골라 주세요."),
  itemKind: z.string().trim().min(1, "어떤 선물인지 적어 주세요.").max(30, "30자 안으로 적어 주세요."),
  boxCount: z
    .string()
    .regex(/^[0-9]+$/, "상자 수를 숫자로 적어 주세요.")
    .transform(Number)
    .pipe(z.number().int().min(1, "상자는 1개 이상이어야 해요.").max(MAX_BOX_COUNT, `상자는 ${MAX_BOX_COUNT}개까지 한 번에 등록할 수 있어요.`)),
  electronicsOrMetal: z.enum(["yes", "no"], { message: "전자기기나 금속 제품이 들어 있는지 골라 주세요." }),
});

export type RegisterFormValues = z.input<typeof registerFormSchema>;
export type RegisterFormOutput = z.output<typeof registerFormSchema>;

export type RegisterInput = {
  creatorId: string;
  itemKind: string;
  boxCount: number;
  hasElectronicsOrMetal: boolean;
};

export type RegisterParseResult =
  | { success: true; data: RegisterInput }
  | { success: false; errors: Partial<Record<keyof RegisterFormValues, string>> };

/** 서버 쪽 등록 처리(DB 연결 때)가 쓰는 경계 — 폼은 같은 스키마를 zodResolver 로 쓴다. 브라우저 검증만 믿지 않는다. */
export function parseRegisterInput(input: unknown): RegisterParseResult {
  const parsed = registerFormSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Partial<Record<keyof RegisterFormValues, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && key in registerFormSchema.shape && !(key in errors)) {
        errors[key as keyof RegisterFormValues] = issue.message;
      }
    }
    return { success: false, errors };
  }
  const { creatorId, itemKind, boxCount, electronicsOrMetal } = parsed.data;
  return { success: true, data: { creatorId, itemKind, boxCount, hasElectronicsOrMetal: electronicsOrMetal === "yes" } };
}
