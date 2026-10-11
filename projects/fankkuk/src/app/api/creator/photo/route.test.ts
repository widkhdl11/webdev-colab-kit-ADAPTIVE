// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/entities/session/model/viewer";

// 프로필 사진 올리기 라우트의 겉껍데기 (creator-link INV-E1·E9, S9b). 본문(사진 파일)을 읽기 전에 거를 것을 먼저 거르는지 본다 —
// 로그인·크리에이터 확인은 본문을 읽기 전에, 크기를 밝히지 않은 요청은 411, 상한을 넘으면 413.
// 사진 처리·저장(saveCreatorPhoto)은 통합 시험(creator-link-db)이 실제 저장소로 본다. 여기서는 그 함수가 불렸는지만 본다.

const state = vi.hoisted(() => ({ viewer: null as Viewer | null, saved: 0 }));

vi.mock("@/shared/api/supabase/server", () => ({ createRequestSupabase: async () => ({}) }));
vi.mock("@/shared/api/supabase/admin", () => ({ createAdminSupabase: () => ({}) }));
vi.mock("@/entities/session/model/viewer", () => ({ readViewer: async () => state.viewer }));
vi.mock("@/features/creator-photo/model/save-creator-photo", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/creator-photo/model/save-creator-photo")>();
  return {
    ...real,
    saveCreatorPhoto: async () => {
      state.saved += 1;
      return { ok: true, photoPath: "c/1.webp" };
    },
  };
});

const { POST } = await import("./route");
const { PHOTO_BODY_LIMIT } = await import("@/features/creator-photo/model/photo-limits");

const SITE = "http://127.0.0.1:3311";

function upload(length: number | null): { req: Request; formData: ReturnType<typeof vi.fn> } {
  const form = new FormData();
  form.append("photo", new Blob([new Uint8Array(8)], { type: "image/jpeg" }), "a.jpg");
  const headers: Record<string, string> = { origin: SITE, host: "127.0.0.1:3311" };
  if (length !== null) headers["content-length"] = String(length);
  const req = new Request(`${SITE}/api/creator/photo`, { method: "POST", headers, body: form });
  const formData = vi.fn(() => Promise.resolve(form));
  Object.defineProperty(req, "formData", { value: formData });
  return { req, formData };
}

beforeEach(() => {
  state.viewer = null;
  state.saved = 0;
});

describe("POST /api/creator/photo — 본문을 읽기 전에 거른다", () => {
  it("INV-E1 (실패경로): 로그인하지 않았으면 401 — 본문(파일)을 읽지 않는다", async () => {
    const { req, formData } = upload(1000);
    expect((await POST(req)).status).toBe(401);
    expect(formData).not.toHaveBeenCalled();
    expect(state.saved).toBe(0);
  });

  it("INV-E1 (실패경로): 팬 계정이면 403 — 본문을 읽지 않는다", async () => {
    state.viewer = { userId: "u1", role: "fan" };
    const { req, formData } = upload(1000);
    expect((await POST(req)).status).toBe(403);
    expect(formData).not.toHaveBeenCalled();
  });

  it("INV-E9 S9b (실패경로): 크기를 밝히지 않은 요청은 411, 상한을 넘으면 413 — 본문을 읽지 않는다", async () => {
    state.viewer = { userId: "u1", role: "creator" };
    const missing = upload(null);
    expect((await POST(missing.req)).status).toBe(411);
    const over = upload(PHOTO_BODY_LIMIT + 1);
    expect((await POST(over.req)).status).toBe(413);
    expect(missing.formData).not.toHaveBeenCalled();
    expect(over.formData).not.toHaveBeenCalled();
  });

  it("INV-E9 S9: 상한 안의 크리에이터 요청은 본문을 읽고 저장으로 넘긴다", async () => {
    state.viewer = { userId: "u1", role: "creator" };
    const { req, formData } = upload(PHOTO_BODY_LIMIT);
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(formData).toHaveBeenCalledTimes(1);
    expect(state.saved).toBe(1);
  });

  it("INV-E1 (실패경로): 다른 사이트에서 온 요청은 403", async () => {
    state.viewer = { userId: "u1", role: "creator" };
    const req = new Request(`${SITE}/api/creator/photo`, { method: "POST", headers: { origin: "https://evil.test", host: "127.0.0.1:3311", "content-length": "10" }, body: "x" });
    expect((await POST(req)).status).toBe(403);
  });
});

describe("본문 상한 — 프록시가 자르는 크기와 맞춘다 (S9)", () => {
  it("INV-E9 S9: 라우트 본문 상한은 사진 상한 10MB 에 양식 머리줄 몫을 더한 값이고, Next 프록시 본문 상한이 같은 값이다", async () => {
    const { PHOTO_MAX_BYTES } = await import("@/features/creator-photo/model/photo-limits");
    expect(PHOTO_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(PHOTO_BODY_LIMIT).toBeGreaterThan(PHOTO_MAX_BYTES);
    const config = (await import("../../../../../next.config")).default;
    expect(config.experimental?.proxyClientMaxBodySize).toBe(PHOTO_BODY_LIMIT);
  });
});
