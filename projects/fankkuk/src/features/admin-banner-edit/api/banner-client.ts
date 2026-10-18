import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { BannerInput } from "../model/save-banner";

// 브라우저에서 광고 배너를 올리고(/api/admin/banners — 그림과 글 칸을 한 양식으로), 순서를 바꾸고, 내린다.
// 저장소로 바로 올리는 길은 없다 — 서버가 그림을 열어 보고 다시 만든다(banners INV-Y4).

const FALLBACK = "저장하지 못했어요. 잠시 뒤 다시 해 주세요.";

export async function sendBanner(input: BannerInput, image: File | null): Promise<PostJsonOutcome> {
  const form = new FormData();
  form.append("data", JSON.stringify(input));
  if (image) form.append("image", image);
  try {
    const res = await fetch("/api/admin/banners", { method: "POST", body: form });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.ok) return { kind: "ok", body: body ?? {} };
    return {
      kind: "failed",
      status: res.status,
      message: res.status < 500 && typeof body?.message === "string" ? body.message : FALLBACK,
      field: typeof body?.field === "string" ? body.field : null,
    };
  } catch {
    return { kind: "failed", status: 0, message: FALLBACK, field: null };
  }
}

export function postBannerOrder(ids: readonly string[]): Promise<PostJsonOutcome> {
  return postJson("/api/admin/banners/order", { ids });
}

export function postBannerRemove(id: string): Promise<PostJsonOutcome> {
  return postJson("/api/admin/banners/remove", { id });
}
