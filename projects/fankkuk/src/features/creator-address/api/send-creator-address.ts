import { z } from "zod";
import type { AddressLabel } from "@/entities/address/model/address-label";
import type { SurchargeRegion } from "@/entities/address/model/surcharge-region";
import type { Envelope } from "@/shared/lib/envelope/envelope";

// 브라우저에서 크리에이터 주소 저장 서명을 요청하고 결과를 묻는다(/api/creator/address · /result, address-protection INV-P22).
// 요청 본문에는 봉인된 주소·고른 이름표·할증 지역 구분(그리고 「다시 보내기」 표시)만 싣는다 — 평문 주소·우편번호가 들어갈 칸이 없다(INV-P1·P13·P16·P20).
// 결과 확인 본문은 요청 ID 하나. 「저장됨」은 서버가 서명을 검증한 뒤에만 온다 — 이 화면은 그 답을 보여 줄 뿐이다.
// saved = 저장됨 · waiting = 카카오톡 서명을 기다림 · login = 세션이 끝났다 · refused = 서버가 거부했다(문구를 그대로 보인다) · failed = 그 밖의 실패

export type StartAddressOutcome =
  | { kind: "saved" }
  | { kind: "waiting"; requestId: string; expiresAt: string }
  | { kind: "login" }
  | { kind: "refused"; message: string; code?: "not_linked" | "too_many" }
  | { kind: "failed" };

/** rejected = 서명 거절 · expired = 서명 시간 지남 · failed = 서명을 확인하지 못함 */
export type CheckAddressOutcome =
  | { kind: "pending" }
  | { kind: "saved" }
  | { kind: "rejected" }
  | { kind: "expired" }
  | { kind: "failed" }
  | { kind: "login" }
  | { kind: "refused"; message: string }
  /** 서버가 결과를 처리하지 못했다(5xx, 503 제외) — 서명 결과를 모른다 */
  | { kind: "error" };

const refusedBody = z.object({ message: z.string(), code: z.enum(["not_linked", "too_many"]).optional() });
const startedBody = z.union([
  z.object({ state: z.literal("saved") }),
  z.object({ state: z.literal("waiting"), requestId: z.string(), expiresAt: z.string() }),
]);
const checkedBody = z.object({ state: z.enum(["pending", "saved", "rejected", "expired", "failed"]) });

async function post(path: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return null;
  }
}

async function refusedOf(res: Response): Promise<{ kind: "refused"; message: string; code?: "not_linked" | "too_many" } | null> {
  const parsed = refusedBody.safeParse(await res.json().catch(() => null));
  // 503(창구 없음)도 서버가 정한 문구를 보인다 — 그 밖의 5xx 는 문구를 믿지 않는다
  if ((res.status >= 500 && res.status !== 503) || !parsed.success) return null;
  return parsed.data.code ? { kind: "refused", message: parsed.data.message, code: parsed.data.code } : { kind: "refused", message: parsed.data.message };
}

export async function startCreatorAddress(envelope: Envelope, label: AddressLabel, region: SurchargeRegion, resend: boolean): Promise<StartAddressOutcome> {
  const res = await post("/api/creator/address", { address: envelope, label, region, resend });
  if (!res) return { kind: "failed" };
  if (res.status === 401) return { kind: "login" };
  if (res.ok) {
    const parsed = startedBody.safeParse(await res.json().catch(() => null));
    if (!parsed.success) return { kind: "failed" };
    return parsed.data.state === "saved" ? { kind: "saved" } : { kind: "waiting", requestId: parsed.data.requestId, expiresAt: parsed.data.expiresAt };
  }
  return (await refusedOf(res)) ?? { kind: "failed" };
}

export async function checkCreatorAddress(requestId: string): Promise<CheckAddressOutcome> {
  const res = await post("/api/creator/address/result", { requestId });
  // 연결이 잠깐 끊긴 것은 실패로 치지 않는다 — 다음 확인에서 다시 묻는다(기한은 화면 시계와 DB 가 본다)
  if (!res) return { kind: "pending" };
  if (res.status === 401) return { kind: "login" };
  if (res.ok) {
    const parsed = checkedBody.safeParse(await res.json().catch(() => null));
    return parsed.success ? { kind: parsed.data.state } : { kind: "pending" };
  }
  if (res.status >= 500 && res.status !== 503) return { kind: "error" };
  const refused = await refusedOf(res);
  return refused ? { kind: "refused", message: refused.message } : { kind: "pending" };
}
