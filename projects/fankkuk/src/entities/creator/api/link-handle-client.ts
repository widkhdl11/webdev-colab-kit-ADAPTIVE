// 브라우저에서 링크용 아이디(팬꾹 링크)를 저장한다 (creator-link INV-E1~E4). 저장 길은 하나 — /api/creator/handle → DB 함수 update_my_creator_handle.
// 상세 설정의 링크 칸과 채널 확인 단계의 ① 팬꾹 링크 만들기가 같이 쓴다. 아이디 한 칸만 보낸다(크리에이터는 DB 가 로그인 토큰으로 정한다).
// ok = 저장된 값(소문자로 바뀐 아이디) / login = 세션이 끝났다 / failed = 저장하지 못했다(서버 문구를 보인다)

export type SaveHandleOutcome = { kind: "ok"; handle: string } | { kind: "login" } | { kind: "failed"; message: string };

const FALLBACK = "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";

export async function saveLinkHandle(handle: string): Promise<SaveHandleOutcome> {
  try {
    const res = await fetch("/api/creator/handle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle }) });
    if (res.status === 401) return { kind: "login" };
    const data = ((await res.json().catch(() => null)) ?? {}) as { handle?: unknown; message?: unknown };
    if (res.ok && typeof data.handle === "string") return { kind: "ok", handle: data.handle };
    return { kind: "failed", message: res.status < 500 && typeof data.message === "string" ? data.message : FALLBACK };
  } catch {
    return { kind: "failed", message: FALLBACK };
  }
}
