import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 판정 검토의 서버 액션 — verdict-review INV-VR9.
 *
 * 서버 액션은 화면이 404 여도 직접 POST 로 부를 수 있다. 그래서 액션이 스스로 막는지를 **액션을 불러서** 본다.
 * 막는 판단은 shared/lib/local-dev.ts 에 있지만(그 파일의 테스트가 판단을 본다), 여기서는 액션이 그 판단을
 * 실제로 쓰고, 막혔을 때 저장소를 만들지조차 않는지를 본다 — 키를 읽는 것부터가 쓰기의 시작이다.
 */

vi.mock("server-only", () => ({}));

let host: string | null = "localhost:3000";
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => (name === "host" ? host : null) }),
}));

const answer = vi.fn(async () => ({ ok: true as const }));
const createReviewStore = vi.fn(() => ({ answer }));
vi.mock("@/features/verdict-review/api/supabase-store", () => ({ createReviewStore }));

const week = { week: "2026-W40", extractedAt: "x", poolSize: 0, shortfall: { hot: 0, notHot: 0 }, firstAnswerAt: null, completedAt: null, closingAt: null, status: null, closedAt: null, summary: null };
vi.mock("@/entities/verdict-review/api/review-queries", () => ({
  fetchReviewWeek: vi.fn(async () => week),
  fetchReviewItems: vi.fn(async () => []),
}));

const INPUT = { week: "2026-W40", itemId: "3f0c2d1e-7b6a-4c5d-9e8f-0a1b2c3d4e5f", answer: "correct" };

const call = async (raw: unknown = INPUT) => {
  const { answerVerdictAction } = await import("@/app/dev/ingest/review/actions");
  return answerVerdictAction(raw);
};

beforeEach(() => {
  vi.resetModules();
  host = "localhost:3000";
  answer.mockClear();
  createReviewStore.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("answerVerdictAction (INV-VR9)", () => {
  it("INV-VR9: 이 PC 의 개발 서버, 이 PC 의 주소면 저장한다", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(await call()).toMatchObject({ ok: true });
    expect(answer).toHaveBeenCalledTimes(1);
  });

  it("INV-VR9: 배포본(NODE_ENV=production)이면 거부하고 저장소도 안 만든다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(await call()).toEqual({ ok: false, error: "forbidden" });
    expect(createReviewStore).not.toHaveBeenCalled();
  });

  it("INV-VR9: Vercel 위면 NODE_ENV 가 무엇이든 거부한다", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "1");
    expect(await call()).toEqual({ ok: false, error: "forbidden" });
    expect(createReviewStore).not.toHaveBeenCalled();
  });

  it("INV-VR9: 같은 와이파이의 다른 기기·DNS 재바인딩 주소면 거부한다", async () => {
    vi.stubEnv("NODE_ENV", "development");
    for (const h of ["192.168.0.7:3000", "evil.example:3000", null]) {
      host = h;
      expect(await call()).toEqual({ ok: false, error: "forbidden" });
    }
    expect(createReviewStore).not.toHaveBeenCalled();
  });

  it("INV-VR3: 모양이 틀린 입력은 DB 에 안 간다", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(await call({ ...INPUT, note: "x" })).toEqual({ ok: false, error: "bad_input" });
    expect(answer).not.toHaveBeenCalled();
  });
});
