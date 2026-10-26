import { z } from "zod";
import type { DifferencePrepareWrite } from "../model/prepare-difference";

// 브라우저에서 차액 결제 준비를 부른다(/api/gifts/difference). 금액은 서버가 돌려준 값만 쓴다.

export type DifferenceCheckout = { orderId: string; orderNo: string; amountKrw: number };
export type PrepareOutcome = { ok: true; checkout: DifferenceCheckout } | { ok: false; message: string };

const okBody = z.object({ orderId: z.string(), orderNo: z.string(), amountKrw: z.number().int().positive() });
const refused = z.object({ message: z.string() });

export async function postDifferencePrepare(write: DifferencePrepareWrite): Promise<PrepareOutcome> {
  try {
    const res = await fetch("/api/gifts/difference", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(write) });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) {
      const parsed = okBody.safeParse(body);
      if (parsed.success) return { ok: true, checkout: parsed.data };
      return { ok: false, message: "결제를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요." };
    }
    const parsed = refused.safeParse(body);
    return { ok: false, message: parsed.success ? parsed.data.message : "결제를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  } catch {
    return { ok: false, message: "결제를 준비하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요." };
  }
}
