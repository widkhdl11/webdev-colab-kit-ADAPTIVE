// 브라우저에서 프로필 사진을 올리거나 지운다(/api/creator/photo). 저장소로 바로 올리는 길은 없다 — 서버가 열어 보고 다시 만든다(creator-link INV-E1·E9).
// ok = 저장됨(새 경로, 지웠으면 null) / login = 세션이 끝났다 / failed = 서버가 준 문구

export type SendPhotoOutcome = { kind: "ok"; photoPath: string | null } | { kind: "login" } | { kind: "failed"; message: string };

const FALLBACK = "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";

async function send(init: RequestInit): Promise<SendPhotoOutcome> {
  try {
    const res = await fetch("/api/creator/photo", init);
    if (res.status === 401) return { kind: "login" };
    const data = ((await res.json().catch(() => null)) ?? {}) as { photoPath?: unknown; message?: unknown };
    if (res.ok) return { kind: "ok", photoPath: typeof data.photoPath === "string" ? data.photoPath : null };
    return { kind: "failed", message: res.status < 500 && typeof data.message === "string" ? data.message : FALLBACK };
  } catch {
    return { kind: "failed", message: FALLBACK };
  }
}

export function sendCreatorPhoto(file: File): Promise<SendPhotoOutcome> {
  const form = new FormData();
  form.append("photo", file);
  return send({ method: "POST", body: form });
}

export function deleteCreatorPhoto(): Promise<SendPhotoOutcome> {
  return send({ method: "DELETE" });
}
