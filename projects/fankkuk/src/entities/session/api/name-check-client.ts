import type { AvailabilityAnswer } from "@/shared/lib/availability/availability-watcher";

// 브라우저에서 아이디·닉네임·팬꾹 링크를 미리 확인한다 (signup INV-U14 — /api/signup/check, 로그인 없이 부른다).
// 가입 화면(아이디·닉네임)과 채널 확인 단계의 팬꾹 링크 만들기 칸이 같이 쓴다. 최종 판정은 저장·가입 때 DB 가 한다.

export type NameCheckKind = "loginId" | "nickname" | "linkHandle";

/** 서버가 주는 답 다섯 — 그 밖(네트워크·서버 오류·모르는 답)은 error */
export const NAME_CHECK_ANSWERS: readonly AvailabilityAnswer[] = ["available", "taken", "invalid", "reserved", "rate_limited"];

/** 끊긴 요청(signal)은 예외를 던진다 — 부르는 쪽(감시기)이 그 답을 버린다. */
export async function checkNameAvailability(kind: NameCheckKind, value: string, signal: AbortSignal): Promise<AvailabilityAnswer> {
  const res = await fetch("/api/signup/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, value }),
    signal,
  });
  const data = (await res.json().catch(() => null)) as { result?: unknown } | null;
  return NAME_CHECK_ANSWERS.find((a) => a === data?.result) ?? "error";
}
