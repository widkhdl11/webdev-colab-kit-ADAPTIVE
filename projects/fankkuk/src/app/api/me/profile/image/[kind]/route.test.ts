// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/entities/session/model/viewer";

// 팬 사진 올리기 라우트의 겉껍데기 (my-account INV-A14, S14b). 본문(사진 파일)을 읽기 전에 거를 것을 먼저 거르는지 본다 —
// 다른 사이트·로그인·팬 확인은 본문을 읽기 전에, 크기를 밝히지 않은 요청은 411, 상한을 넘으면 400.
// 사진 처리·저장(saveFanImage)은 통합 시험(fan-profile-db)이 실제 저장소로 본다. 여기서는 그 함수가 불렸는지만 본다.

const state = vi.hoisted(() => ({ viewer: null as Viewer | null, saved: 0 }));

vi.mock("@/shared/api/supabase/server", () => ({ createRequestSupabase: async () => ({}) }));
vi.mock("@/shared/api/supabase/admin", () => ({ createAdminSupabase: () => ({}) }));
vi.mock("@/entities/session/model/viewer", () => ({ readViewer: async () => state.viewer }));
vi.mock("@/features/fan-profile-edit/model/save-fan-image", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/fan-profile-edit/model/save-fan-image")>();
  return {
    ...real,
    saveFanImage: async () => {
      state.saved += 1;
      return { ok: true, path: "f/p-1.webp" };
    },
  };
});

const { POST } = await import("./route");
const { PHOTO_BODY_LIMIT } = await import("@/shared/lib/image/photo-limits");

const SITE = "http://127.0.0.1:3311";
const ctx = (kind: string) => ({ params: Promise.resolve({ kind }) });

function upload(length: number | null, origin = SITE): { req: Request; formData: ReturnType<typeof vi.fn> } {
  const form = new FormData();
  form.append("photo", new Blob([new Uint8Array(8)], { type: "image/jpeg" }), "a.jpg");
  const headers: Record<string, string> = { origin, host: "127.0.0.1:3311" };
  if (length !== null) headers["content-length"] = String(length);
  const req = new Request(`${SITE}/api/me/profile/image/photo`, { method: "POST", headers, body: form });
  const formData = vi.fn(() => Promise.resolve(form));
  Object.defineProperty(req, "formData", { value: formData });
  return { req, formData };
}

beforeEach(() => {
  state.viewer = null;
  state.saved = 0;
});

describe("POST /api/me/profile/image/{kind} — 본문을 읽기 전에 거른다", () => {
  it("INV-A14 (실패경로): 다른 사이트에서 온 요청은 403 — 본문을 읽지 않는다", async () => {
    state.viewer = { userId: "f1", role: "fan" };
    const { req, formData } = upload(1000, "https://evil.example");
    expect((await POST(req, ctx("photo"))).status).toBe(403);
    expect(formData).not.toHaveBeenCalled();
  });

  it("INV-A14 (실패경로): 로그인 안 함 401·크리에이터 403 — 본문을 읽지 않는다", async () => {
    for (const [viewer, status] of [
      [null, 401],
      [{ userId: "c1", role: "creator" as const }, 403],
    ] as const) {
      state.viewer = viewer;
      const { req, formData } = upload(1000);
      const res = await POST(req, ctx("photo"));
      expect(res.status).toBe(status);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(formData).not.toHaveBeenCalled();
    }
    expect(state.saved).toBe(0);
  });

  it("INV-A14 S14b (실패경로): 크기를 밝히지 않으면 411, 상한을 넘으면 400 — 본문을 읽지 않는다", async () => {
    state.viewer = { userId: "f1", role: "fan" };
    const none = upload(null);
    expect((await POST(none.req, ctx("photo"))).status).toBe(411);
    const big = upload(PHOTO_BODY_LIMIT + 1);
    expect((await POST(big.req, ctx("background"))).status).toBe(400);
    expect([none.formData.mock.calls.length, big.formData.mock.calls.length, state.saved]).toEqual([0, 0, 0]);
  });

  it("INV-A14: 없는 종류는 404, 팬이 상한 안의 파일을 올리면 저장 함수로 간다", async () => {
    state.viewer = { userId: "f1", role: "fan" };
    expect((await POST(upload(1000).req, ctx("symbol"))).status).toBe(404);
    const ok = upload(PHOTO_BODY_LIMIT);
    const res = await POST(ok.req, ctx("photo"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ path: "f/p-1.webp" });
    expect(state.saved).toBe(1);
  });
});
