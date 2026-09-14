import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostSummary } from "@/entities/post";

// 스펙: docs/specs/ai-assist.md — INV-G4 · G5 · G6
//
// **여기서 붙드는 것은 「개발 중에 어느 갈래로 갔는지 알 수 있나」다.**
//
// 규칙 순서로 떨어지는 길이 넷인데 화면 문구는 둘뿐이고, 그렇게 덮는 것은 의도다
// (`model/section-copy.ts`). 그래서 2026-09-11 에 「AI 추천이 안 나온다」를 쫓을 때
// 만드는 사람도 화면만으로는 못 갈랐고 데이터베이스를 직접 뒤져야 했다.
//
// **판단 함수를 대역으로 세우지 않는다.** `recommend` 는 진짜로 돈다 — 그래야 로그에 찍힌
// 갈래가 실제로 일어난 갈래와 같은지를 볼 수 있다. 대역으로 세우면 「대역이 준 값을 그대로
// 찍는다」만 보게 되고, 로그와 실제가 갈리는 것이 바로 이 검사가 막으려는 일이다.
//
// 대역으로 세우는 것은 경계 밖(세션·데이터베이스·모델 제공자)뿐이다.

const currentUser = vi.fn();
vi.mock("@/entities/session", () => ({ currentUser }));

const readPosts = vi.fn();
vi.mock("@/entities/post", () => ({ readPosts }));

const readEvidence = vi.fn();
vi.mock("./read-evidence", () => ({ readEvidence }));

const generate = vi.fn();
// 제공자 구현은 `server-only` 를 들여서 검사 환경에서 안 돈다. 경계 밖이라 대역이 맞다.
vi.mock("@/shared/api/model/gemini", () => ({ geminiModel: { generate } }));

const { recommendForHome } = await import("./recommend-for-home");

function post(id: string): PostSummary {
  return {
    id,
    title: `제목 ${id}`,
    summary: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    viewsCount: 0,
    likesCount: 0,
    study: {
      id: `s-${id}`,
      categoryId: "it",
      categoryName: "IT/개발",
      regionCode: "seoul",
      regionName: "서울",
      locationDetail: null,
      meetingMode: "online",
      capacity: 6,
      filled: 1,
      recruiting: true,
      recruitUntil: null,
      slots: [],
    },
  };
}

const NO_EVIDENCE = {
  interestCategoryId: null,
  regionCode: null,
  likedTitles: [],
  appliedStudyTitles: [],
};

const WITH_EVIDENCE = { ...NO_EVIDENCE, interestCategoryId: "it" };

/**
 * 재사용 창(INV-G7)은 프로세스 하나를 같이 쓴다. 검사마다 다른 사람으로 부르지 않으면
 * 앞 검사가 담아 둔 순서가 다음 검사의 갈래를 바꾼다.
 */
let seq = 0;
const nextUser = () => ({ id: `u-${++seq}` });

let info: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "development");
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  readPosts.mockResolvedValue({ posts: [post("a"), post("b")] });
  readEvidence.mockResolvedValue(WITH_EVIDENCE);
  currentUser.mockResolvedValue(nextUser());
  generate.mockResolvedValue(JSON.stringify({ ranked: ["b", "a"] }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** 찍힌 줄 전부를 한 덩어리로. 갈래 이름이 어느 줄에 있든 보게 된다 */
const logged = () =>
  (info.mock.calls as unknown[][]).map((call) => String(call[0])).join("\n");

describe("개발 중에 추천이 어느 갈래로 갔는지 로그로 갈린다", () => {
  it("INV-G4 (비로그인): anonymous 로 찍힌다", async () => {
    currentUser.mockResolvedValue(null);

    await recommendForHome();

    expect(logged()).toContain("rule (anonymous)");
  });

  it("INV-G6 (근거 0건): no-evidence 로 찍힌다 — 2026-09-11 에 못 갈랐던 바로 그 갈래다", async () => {
    readEvidence.mockResolvedValue(NO_EVIDENCE);

    await recommendForHome();

    expect(logged()).toContain("rule (no-evidence)");
  });

  it("후보 0건: no-candidates 로 찍힌다", async () => {
    readPosts.mockResolvedValue({ posts: [] });

    await recommendForHome();

    expect(logged()).toContain("rule (no-candidates)");
  });

  it("INV-G5 (모델 실패): model-unavailable 로 찍힌다", async () => {
    generate.mockRejectedValue(new Error("제공자가 아프다"));

    await recommendForHome();

    expect(logged()).toContain("rule (model-unavailable)");
  });

  it("모델이 정했으면 model 로 찍히고 이유는 안 붙는다", async () => {
    await recommendForHome();

    expect(logged()).toContain("[recommend] model ·");
    expect(logged()).not.toContain("rule");
  });

  it("네 갈래가 서로 다른 말로 찍힌다 — 하나로 뭉개지면 갈라 볼 수 없다", async () => {
    const seen: string[] = [];

    currentUser.mockResolvedValue(null);
    await recommendForHome();
    seen.push(logged());

    for (const setup of [
      () => readEvidence.mockResolvedValue(NO_EVIDENCE),
      () => readPosts.mockResolvedValue({ posts: [] }),
      () => generate.mockRejectedValue(new Error("제공자가 아프다")),
    ]) {
      info.mockClear();
      // 갈래 하나만 갈아 끼운다. 앞 검사의 설정을 안 되돌리면 둘이 겹쳐서
      // 다른 갈래로 떨어지고, 그러면 「넷이 다르다」가 우연히 거짓이 된다.
      readPosts.mockResolvedValue({ posts: [post("a"), post("b")] });
      readEvidence.mockResolvedValue(WITH_EVIDENCE);
      generate.mockResolvedValue(JSON.stringify({ ranked: ["b", "a"] }));
      currentUser.mockResolvedValue(nextUser());
      setup();
      await recommendForHome();
      seen.push(logged());
    }

    expect(new Set(seen).size).toBe(4);
  });

  it("그린 건수가 같이 찍힌다 — 「구역이 비었다」와 「갈래가 이것이다」는 다른 질문이다", async () => {
    await recommendForHome();

    expect(logged()).toContain("그린 것 2건");
  });
});

describe("운영에서는 아무것도 안 찍는다", () => {
  it("NODE_ENV 가 production 이면 갈래를 안 남긴다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    readEvidence.mockResolvedValue(NO_EVIDENCE);

    await recommendForHome();

    expect(info).not.toHaveBeenCalled();
  });

  it("production 에서도 결과 자체는 그대로다 — 로그가 동작을 바꾸면 안 된다", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(recommendForHome()).resolves.toMatchObject({
      kind: "model",
      reason: null,
    });
    expect(info).not.toHaveBeenCalled();
  });
});

describe("로그는 요청자를 안 남긴다", () => {
  it("사용자 식별자가 찍히는 줄에 없다", async () => {
    const user = nextUser();
    currentUser.mockResolvedValue(user);
    readEvidence.mockResolvedValue(NO_EVIDENCE);

    await recommendForHome();

    expect(logged()).not.toContain(user.id);
  });
});
