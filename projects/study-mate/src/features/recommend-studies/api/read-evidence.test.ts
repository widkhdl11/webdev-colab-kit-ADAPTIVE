import { beforeEach, describe, expect, it, vi } from "vitest";

// 스펙: docs/specs/ai-assist.md — INV-G2
//
// **여기서 붙드는 것은 「어느 연결로 읽는가」다.**
//
// 통합 검사(`tests/integration/recommendation-evidence.test.ts`)는 클라이언트를 **인자로
// 넣어** 질의 함수를 부른다. 그래서 앱이 실제로 무엇을 고르는지 — `read-evidence.ts` 의
// `await createServerSupabase()` 한 줄 — 은 그 검사 밖에 있었고, 그 줄을 정책을 우회하는
// 클라이언트로 바꿔도 전부 초록불이었다(2026-09-10 test-auditor).
//
// 대역으로 세우는 것은 **이웃**(연결을 만드는 팩토리)이지 검증 대상이 아니다.
// 검증 대상은 「읽는 코드가 그 팩토리가 준 것만 쓰는가」이고, 그것이 여기서 실제로 돈다.

const createServerSupabase = vi.fn();
vi.mock("@/shared/api/supabase/server-client", () => ({ createServerSupabase }));

const profileEvidenceQuery = vi.fn();
const likedTitlesQuery = vi.fn();
const appliedTitlesQuery = vi.fn();
vi.mock("./evidence-query", () => ({
  profileEvidenceQuery,
  likedTitlesQuery,
  appliedTitlesQuery,
  EVIDENCE_TITLE_MAX: 10,
}));

const { readEvidence } = await import("./read-evidence");

/** 세션으로 붙은 연결이라고 **표시만 한** 값. 같은 것이 질의로 갔는지만 본다 */
const SESSION_DB = { tag: "session" };

beforeEach(() => {
  vi.clearAllMocks();
  createServerSupabase.mockResolvedValue(SESSION_DB);
  profileEvidenceQuery.mockResolvedValue({ data: { interest_category: "it", region: "seoul" } });
  likedTitlesQuery.mockResolvedValue({ data: [{ post: { title: "좋아요 누른 글" } }] });
  appliedTitlesQuery.mockResolvedValue({ data: [{ study: { title: "신청한 스터디" } }] });
});

describe("INV-G2: 근거를 읽는 연결은 요청자의 세션이다", () => {
  it("INV-G2: 세 질의가 전부 세션 연결로 간다", async () => {
    await readEvidence("u1");

    expect(createServerSupabase).toHaveBeenCalledOnce();
    for (const query of [profileEvidenceQuery, likedTitlesQuery, appliedTitlesQuery]) {
      expect(query).toHaveBeenCalledWith(SESSION_DB, "u1");
    }
  });

  it("INV-G2: 읽은 값이 그대로 근거가 된다 — 연결만 보고 결과를 안 보면 절반이다", async () => {
    await expect(readEvidence("u1")).resolves.toEqual({
      interestCategoryId: "it",
      regionCode: "seoul",
      likedTitles: ["좋아요 누른 글"],
      appliedStudyTitles: ["신청한 스터디"],
    });
  });

  it("INV-G5 (실패경로): 연결을 못 만들면 던지지 않고 빈 근거를 돌려준다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    createServerSupabase.mockRejectedValue(new Error("설정이 없다"));

    await expect(readEvidence("u1")).resolves.toEqual({
      interestCategoryId: null,
      regionCode: null,
      likedTitles: [],
      appliedStudyTitles: [],
    });
  });

  it("INV-G5 (실패경로): 근거 하나가 죽어도 나머지는 산다", async () => {
    // `Promise.all` 이면 하나가 거부될 때 전부를 버려서, 관심 분야도 좋아요도 멀쩡한
    // 사용자가 「근거 없음」으로 판정되고 화면 문구까지 바뀐다.
    likedTitlesQuery.mockRejectedValue(new Error("네트워크"));

    const evidence = await readEvidence("u1");
    expect(evidence.likedTitles).toEqual([]);
    expect(evidence.interestCategoryId).toBe("it");
    expect(evidence.appliedStudyTitles).toEqual(["신청한 스터디"]);
  });
});
