import type { FanImageKind } from "@/entities/fan/model/fan-profile";

// 브라우저에서 팬 프로필을 보낸다. 사진은 /api/me/profile/image/{photo|background} 로 — 저장소로 바로 올리는 길은 없다(my-account INV-A14).
// 소개는 /api/me/profile(JSON) — 서버·DB 가 다시 검사한다(INV-A12). 서버가 준 문구를 그대로 보여 준다.
// ok = 저장됨 / login = 세션이 끝났다 / failed = 서버가 준 문구

export type SendOutcome<T> = ({ kind: "ok" } & T) | { kind: "login" } | { kind: "failed"; message: string };

const FALLBACK = "저장하지 못했어요. 잠시 뒤 다시 해 주세요.";

async function send<T>(url: string, init: RequestInit, pick: (data: Record<string, unknown>) => T): Promise<SendOutcome<T>> {
  try {
    const res = await fetch(url, init);
    if (res.status === 401) return { kind: "login" };
    const data = ((await res.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    if (res.ok) return { kind: "ok", ...pick(data) };
    return { kind: "failed", message: res.status < 500 && typeof data.message === "string" ? data.message : FALLBACK };
  } catch {
    return { kind: "failed", message: FALLBACK };
  }
}

const pathOf = (d: Record<string, unknown>) => ({ path: typeof d.path === "string" ? d.path : null });

export function sendFanImage(kind: FanImageKind, file: File): Promise<SendOutcome<{ path: string | null }>> {
  const form = new FormData();
  form.append("photo", file);
  return send(`/api/me/profile/image/${kind}`, { method: "POST", body: form }, pathOf);
}

export function deleteFanImage(kind: FanImageKind): Promise<SendOutcome<{ path: string | null }>> {
  return send(`/api/me/profile/image/${kind}`, { method: "DELETE" }, pathOf);
}

export function sendFanIntro(intro: string): Promise<SendOutcome<{ intro: string }>> {
  return send(
    "/api/me/profile",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intro }) },
    (d) => ({ intro: typeof d.intro === "string" ? d.intro : intro }),
  );
}
