import { beforeEach, describe, expect, it, vi } from "vitest";

// 스펙: docs/specs/ai-assist.md — INV-G8 (시나리오 S8) · INV-G4
//
// **여기서 붙드는 것은 순서다.** 통합 검사는 질의 함수만 보는데, 그 파일 스스로 적어
// 두었듯 `host_id` 는 정책이 아니라 필터다. 그러면 INV-G8 을 지키는 것은 두 가지다 —
// 넣는 id 가 세션에서 온다는 것, 그리고 **거절이 모델 호출보다 앞에 있다는 것**.
// 둘 다 검사가 없었고, 프롬프트 만들기를 호스트 확인 앞으로 옮겨도 전부 초록불이었다
// (2026-09-10 test-auditor). S8 이 "그 스터디의 설명은 프롬프트에 들어가지 않는다
// (모델 호출 자체가 안 일어난다)"라고 쓴 바로 그 절반이다.
//
// 대역은 전부 **이웃**이다: 세션 판독기 · 데이터베이스 연결 · 모델 제공자.
// 검증 대상인 액션은 실제로 돈다.

const currentUser = vi.fn();
vi.mock("@/entities/session", () => ({ currentUser }));

const createServerSupabase = vi.fn(async () => ({ tag: "session" }));
vi.mock("@/shared/api/supabase/server-client", () => ({ createServerSupabase }));

const hostedStudyForDraftQuery = vi.fn();
vi.mock("./draft-query", () => ({ hostedStudyForDraftQuery }));

const generate = vi.fn();
vi.mock("@/shared/api/model/gemini", () => ({ geminiModel: { generate } }));

const { draftPostAction } = await import("./draft-post");

const STUDY = "11111111-1111-4111-8111-111111111111";

const STUDY_ROW = {
  title: "내 스터디",
  description: "설명",
  max_participants: 6,
  meeting_mode: "online",
  location_detail: null,
  category: { name: "IT/개발" },
  region: { name: "서울" },
  slots: [{ weekday: 2, starts_at: "20:00" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  currentUser.mockResolvedValue({ id: "u1" });
  hostedStudyForDraftQuery.mockResolvedValue({ data: STUDY_ROW, error: null });
  generate.mockResolvedValue('{"title":"제목","summary":"한 줄","content":"본문"}');
});

describe("INV-G8: 호스트가 아니면 모델에 닿지 않는다", () => {
  it("INV-G8 (실패경로): 내 스터디가 아니면 거절하고 **모델을 안 부른다**", async () => {
    hostedStudyForDraftQuery.mockResolvedValue({ data: null, error: null });

    const result = await draftPostAction(STUDY);
    expect(result.ok).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });

  it("INV-G8 (반대 절반): 내 스터디면 부른다 — 전부 막아서 통과한 게 아니다", async () => {
    const result = await draftPostAction(STUDY);
    expect(result.ok).toBe(true);
    expect(generate).toHaveBeenCalledOnce();
  });

  it("INV-G8: 질의에 넣는 사용자 id 는 **세션에서** 온다", async () => {
    // 화면이 보낸 값을 넣도록 바꾸면 이 검사가 깨진다. 그 한 줄이 유일한 방벽이다.
    await draftPostAction(STUDY);
    expect(hostedStudyForDraftQuery).toHaveBeenCalledWith({ tag: "session" }, STUDY, "u1");
  });

  it("INV-G8: 프롬프트에 들어가는 것은 그 스터디의 값이다", async () => {
    await draftPostAction(STUDY);
    const request = generate.mock.calls[0]?.[0] as { data: string; instruction: string };
    const parsed = JSON.parse(request.data) as { study: { title: string; slots: unknown[] } };
    expect(parsed.study.title).toBe("내 스터디");
    // 스펙이 근거에 「일정」을 적어 뒀다 — 처음엔 안 실어 보냈다
    expect(parsed.study.slots).toEqual([{ weekday: 2, startsAt: "20:00" }]);
  });

  it("INV-G4 (실패경로): 로그인 안 했으면 데이터베이스도 모델도 안 건드린다", async () => {
    currentUser.mockResolvedValue(null);

    const result = await draftPostAction(STUDY);
    expect(result.ok).toBe(false);
    expect(hostedStudyForDraftQuery).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("INV-G8 (실패경로): 스터디 id 가 비면 아무것도 안 건드린다", async () => {
    const result = await draftPostAction("");
    expect(result.ok).toBe(false);
    expect(hostedStudyForDraftQuery).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("INV-G9 (실패경로): 모델이 모양을 안 지키면 초안이 안 나간다", async () => {
    generate.mockResolvedValue("죄송합니다");
    const result = await draftPostAction(STUDY);
    expect(result.ok).toBe(false);
  });

  it("INV-G5 (실패경로): 모델이 던져도 액션은 문구만 돌려준다 — 원문이 안 나간다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    generate.mockRejectedValue(new Error("API key not valid: AIzaSyXXXX"));

    const result = await draftPostAction(STUDY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toContain("AIzaSy");
  });
});
