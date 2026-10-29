// 브라우저에서 선물 사진을 올리거나 지운다(/api/gifts/photo/{주문번호}). 저장소로 바로 올리는 길은 없다 —
// 서버가 열어 보고 사진 정보를 지운 뒤 다시 만든다(together INV-F2).
// ok = 저장됨(새 판 번호, 지웠으면 null) / login = 세션이 끝났다 / failed = 서버가 준 문구

export type SendGiftPhotoOutcome = { kind: "ok"; version: number | null } | { kind: "login" } | { kind: "failed"; message: string };

const FALLBACK = "사진을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";

/** 화면이 그리는 사진 주소 — 서버가 본인에게만 짧은 서명 주소로 넘겨준다. 판 번호를 붙여 바꾼 사진이 바로 보이게. */
export function giftPhotoSrc(orderNo: string, version: number): string {
  return `/api/gifts/photo/${encodeURIComponent(orderNo)}?v=${version}`;
}

async function send(orderNo: string, init: RequestInit): Promise<SendGiftPhotoOutcome> {
  try {
    const res = await fetch(`/api/gifts/photo/${encodeURIComponent(orderNo)}`, init);
    if (res.status === 401) return { kind: "login" };
    const data = ((await res.json().catch(() => null)) ?? {}) as { version?: unknown; message?: unknown };
    if (res.ok) return { kind: "ok", version: typeof data.version === "number" ? data.version : null };
    return { kind: "failed", message: res.status < 500 && typeof data.message === "string" ? data.message : FALLBACK };
  } catch {
    return { kind: "failed", message: FALLBACK };
  }
}

export function sendGiftPhoto(orderNo: string, file: File): Promise<SendGiftPhotoOutcome> {
  const form = new FormData();
  form.append("photo", file);
  return send(orderNo, { method: "POST", body: form });
}

export function deleteGiftPhoto(orderNo: string): Promise<SendGiftPhotoOutcome> {
  return send(orderNo, { method: "DELETE" });
}
