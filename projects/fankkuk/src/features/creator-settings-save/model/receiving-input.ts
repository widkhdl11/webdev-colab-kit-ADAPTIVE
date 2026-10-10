import { z } from "zod";
import { ANNIVERSARY_MAX, ANNIVERSARY_NAME_MAX, MONTHLY_LIMIT_MAX, parseIsoDate } from "@/entities/creator/model/receiving";
import { charCount } from "@/shared/lib/validation/char-count";

// 크리에이터 받는 양 조절 입력 경계 (creator-receiving INV-B3·B5·B7). 앱 서버가 먼저 꼴을 보고, DB 함수가 같은 규칙으로 다시 검사한다
// (다시 받는 날의 범위·달력에 있는 날·이름 필터는 DB 가 한국 시간 오늘로 판정한다).
// 본문에서 정해진 칸만 꺼낸다. 크리에이터 ID·계정 ID 칸은 있어도 읽지 않는다(INV-B1).

export const receivingInputSchema = z
  .object({
    resting: z.boolean(),
    // 꼴(YYYY-MM-DD)과 달력에 있는 날(2026-02-30 거부)을 같이 본다
    resumeOn: z
      .string()
      .refine((s) => parseIsoDate(s) !== null, "다시 받는 날을 골라 주세요.")
      .nullable(),
    monthlyLimit: z.number().int().min(1).max(MONTHLY_LIMIT_MAX).nullable(),
  })
  .refine((v) => !v.resting || v.resumeOn !== null, { message: "쉬는 동안에는 다시 받는 날을 꼭 골라 주세요.", path: ["resumeOn"] });

export type ReceivingInput = z.infer<typeof receivingInputSchema>;

const monthDay = { month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) };

export const daysInputSchema = z.object({
  birthday: z.object(monthDay).nullable(),
  anniversaries: z
    .array(
      z.object({
        name: z
          .string()
          .trim()
          .refine((s) => charCount(s) >= 1 && charCount(s) <= ANNIVERSARY_NAME_MAX, `기념일 이름은 1~${ANNIVERSARY_NAME_MAX}자로 적어 주세요.`),
        ...monthDay,
      }),
    )
    .max(ANNIVERSARY_MAX, `기념일은 ${ANNIVERSARY_MAX}개까지 적을 수 있어요.`),
});

export type DaysInput = z.infer<typeof daysInputSchema>;
