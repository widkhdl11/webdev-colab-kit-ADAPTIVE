import type { WithdrawLink } from "../model/withdraw-self";

// 브라우저에서 본인 탈퇴를 보낸다(/api/me/withdraw, my-account INV-A17). 보내는 것은 지금 비밀번호 하나 — 계정은 서버가 세션으로 정한다.
// 막혔으면 서버가 준 이유와 링크(진행 중인 선물 목록·1:1 문의)를 넘긴다. 링크는 같은 사이트 주소(/로 시작)만 받는다.

export type WithdrawSelfOutcome =
  | { kind: "ok" }
  | { kind: "login" }
  | { kind: "failed"; message: string; field: "currentPassword" | null; links: WithdrawLink[] };

const FALLBACK = "탈퇴를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";

function isSiteLink(value: unknown): value is WithdrawLink {
  if (typeof value !== "object" || value === null) return false;
  const { href, label } = value as Record<string, unknown>;
  return typeof href === "string" && href.startsWith("/") && !href.startsWith("//") && typeof label === "string";
}

export async function sendWithdrawSelf(currentPassword: string): Promise<WithdrawSelfOutcome> {
  try {
    const res = await fetch("/api/me/withdraw", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword }) });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.ok) return { kind: "ok" };
    if (res.status === 401) return { kind: "login" };
    return {
      kind: "failed",
      message: typeof body?.message === "string" ? body.message : FALLBACK,
      field: body?.field === "currentPassword" ? "currentPassword" : null,
      links: Array.isArray(body?.links) ? body.links.filter(isSiteLink) : [],
    };
  } catch {
    return { kind: "failed", message: FALLBACK, field: null, links: [] };
  }
}
