import { z } from "zod";
import type { AddressLabel } from "@/entities/address/model/address-label";
import type { Envelope } from "@/shared/lib/envelope/envelope";

// 브라우저에서 크리에이터 주소를 저장한다(/api/creator/address). 본문에는 봉인된 주소와 고른 이름표만 싣는다 — 평문 주소가 들어갈 칸이 없다(INV-P1·P13·P16).
// ok = 저장됨 / login = 세션이 끝났다 / refused = 서버가 거부했다(문구를 그대로 보인다) / failed = 그 밖의 실패

export type SendCreatorAddressOutcome = { kind: "ok" } | { kind: "login" } | { kind: "refused"; message: string } | { kind: "failed" };

const refused = z.object({ message: z.string() });

export async function sendCreatorAddress(envelope: Envelope, label: AddressLabel): Promise<SendCreatorAddressOutcome> {
  try {
    const res = await fetch("/api/creator/address", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: envelope, label }),
    });
    if (res.ok) return { kind: "ok" };
    if (res.status === 401) return { kind: "login" };
    const parsed = refused.safeParse(await res.json().catch(() => null));
    // 503(창구 없음)도 서버가 정한 문구를 보인다 — 그 밖의 5xx 는 문구를 믿지 않는다
    if ((res.status < 500 || res.status === 503) && parsed.success) return { kind: "refused", message: parsed.data.message };
    return { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}
