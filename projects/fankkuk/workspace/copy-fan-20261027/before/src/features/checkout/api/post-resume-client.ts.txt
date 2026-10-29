import { z } from "zod";
import type { ResumePaymentWrite } from "../model/resume-payment";

// 브라우저에서 결제 이어 하기 준비를 부른다(/api/checkout/resume, payment INV-M22). 금액은 서버가 돌려준 값만 쓴다.

const okBody = z.object({ orderId: z.string(), orderNo: z.string(), amountKrw: z.number().int().positive() });
export type ResumeCheckout = z.infer<typeof okBody>;
export type ResumeOutcome = { ok: true; checkout: ResumeCheckout } | { ok: false; message: string };
const refused = z.object({ message: z.string() });
const FAILED = "결제를 준비하지 못했어요. 잠시 뒤 다시 해 주세요.";

export async function postResumePayment(write: ResumePaymentWrite): Promise<ResumeOutcome> {
  try {
    const res = await fetch("/api/checkout/resume", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(write) });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) {
      const parsed = okBody.safeParse(body);
      return parsed.success ? { ok: true, checkout: parsed.data } : { ok: false, message: FAILED };
    }
    const parsed = refused.safeParse(body);
    return { ok: false, message: parsed.success ? parsed.data.message : FAILED };
  } catch {
    return { ok: false, message: "결제를 준비하지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요." };
  }
}
