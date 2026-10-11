// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/entities/session/model/viewer";

// 선물 사진 라우트의 겉껍데기 (together INV-F2). 본문(사진 파일)을 읽기 전에 거를 것을 먼저 거르는지 본다 —
// 로그인 확인은 본문을 읽기 전에, 크기를 밝히지 않은 요청은 411, 상한을 넘으면 413, 다른 사이트의 요청은 403.
// 주인 확인·사진 처리·저장(saveGiftPhoto)은 통합 시험(together-db·together-routes)이 실제 DB·저장소로 본다. 여기서는 불렸는지만 본다.

const state = vi.hoisted(() => ({ viewer: null as Viewer | null, saved: 0, removed: 0 }));

vi.mock("@/shared/api/supabase/server", () => ({ createRequestSupabase: async () => ({}) }));
vi.mock("@/shared/api/supabase/admin", () => ({ createAdminSupabase: () => ({}) }));
vi.mock("@/entities/session/model/viewer", () => ({ readViewer: async () => state.viewer }));
vi.mock("@/features/gift-photo/model/save-gift-photo", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/gift-photo/model/save-gift-photo")>();
  return {
    ...real,
    saveGiftPhoto: async () => {
      state.saved += 1;
      return { ok: true, version: 1 };
    },
    removeGiftPhoto: async () => {
      state.removed += 1;
      return { ok: true, version: null };
    },
  };
});

const { POST, DELETE } = await import("./route");
const { PHOTO_BODY_LIMIT } = await import("@/shared/lib/image/photo-limits");

const SITE = "http://127.0.0.1:3311";
const ctx = { params: Promise.resolve({ orderNo: "FC-ABC123" }) };

function upload(length: number | null, origin = SITE): { req: Request; formData: ReturnType<typeof vi.fn> } {
  const form = new FormData();
  form.append("photo", new Blob([new Uint8Array(8)], { type: "image/jpeg" }), "a.jpg");
  const headers: Record<string, string> = { origin, host: "127.0.0.1:3311" };
  if (length !== null) headers["content-length"] = String(length);
  const req = new Request(`${SITE}/api/gifts/photo/FC-ABC123`, { method: "POST", headers, body: form });
  const formData = vi.fn(() => Promise.resolve(form));
  Object.defineProperty(req, "formData", { value: formData });
  return { req, formData };
}

beforeEach(() => {
  state.viewer = null;
  state.saved = 0;
  state.removed = 0;
});

describe("POST /api/gifts/photo/{주문번호} — 본문을 읽기 전에 거른다", () => {
  it("INV-F2 (실패경로): 로그인하지 않았으면 401 — 본문(파일)을 읽지 않는다", async () => {
    const { req, formData } = upload(1000);
    const res = await POST(req, ctx);
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(formData).not.toHaveBeenCalled();
    expect(state.saved).toBe(0);
  });

  it("INV-F2 (실패경로): 크기를 밝히지 않은 요청은 411, 상한을 넘으면 413 — 본문을 읽지 않는다", async () => {
    state.viewer = { userId: "u1", role: "fan" };
    const missing = upload(null);
    expect((await POST(missing.req, ctx)).status).toBe(411);
    const over = upload(PHOTO_BODY_LIMIT + 1);
    expect((await POST(over.req, ctx)).status).toBe(413);
    expect(missing.formData).not.toHaveBeenCalled();
    expect(over.formData).not.toHaveBeenCalled();
    expect(state.saved).toBe(0);
  });

  it("INV-F2: 상한 안의 로그인한 요청은 본문을 읽고 저장으로 넘긴다", async () => {
    state.viewer = { userId: "u1", role: "fan" };
    const { req, formData } = upload(PHOTO_BODY_LIMIT);
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 1 });
    expect(formData).toHaveBeenCalledTimes(1);
    expect(state.saved).toBe(1);
  });

  it("INV-F2 (실패경로): 다른 사이트에서 온 올리기·지우기는 403", async () => {
    state.viewer = { userId: "u1", role: "fan" };
    const { req, formData } = upload(1000, "https://evil.example");
    expect((await POST(req, ctx)).status).toBe(403);
    expect(formData).not.toHaveBeenCalled();
    const del = new Request(`${SITE}/api/gifts/photo/FC-ABC123`, { method: "DELETE", headers: { origin: "https://evil.example", host: "127.0.0.1:3311" } });
    expect((await DELETE(del, ctx)).status).toBe(403);
    expect(state.saved + state.removed).toBe(0);
  });
});
