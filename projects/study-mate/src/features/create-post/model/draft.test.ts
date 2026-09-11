import { describe, expect, it } from "vitest";
import { CONTENT_MAX, SUMMARY_MAX, TITLE_MAX } from "@/entities/post/model/limits";
import { applyDraft, parseDraft } from "./draft";

// 스펙: docs/specs/ai-assist.md — INV-G9
//
// 초안은 모델이 만든 **문장 자체가 결과물**이라, 추천처럼 「답을 값으로 안 믿는다」로
// 막을 수 없다. 대신 두 가지를 한다: ① 모양이 다르면 통째로 버리고 ② 폼 칸의 상한을
// 넘는 칸은 **자르지 않고 비운다.** 조용히 자르면 사용자가 잘린 줄 모르고 발행한다.

const ok = '{"title":"제목","summary":"한 줄","content":"본문"}';

describe("INV-G9: 초안은 모양이 맞을 때만 폼에 넣을 값이 된다", () => {
  it("INV-G9: 세 칸이 다 있으면 그대로 읽는다", () => {
    expect(parseDraft(ok)).toEqual({ title: "제목", summary: "한 줄", content: "본문" });
  });

  it("INV-G9 (실패경로): JSON 이 아니면 통째로 버린다", () => {
    expect(parseDraft("죄송합니다. 초안을 만들 수 없습니다.")).toBeNull();
  });

  it("INV-G9 (실패경로): 필수 칸이 없으면 버린다", () => {
    expect(parseDraft('{"title":"제목"}')).toBeNull();
  });

  it("INV-G9 (실패경로): 값이 문자열이 아니면 버린다", () => {
    expect(parseDraft('{"title":1,"summary":"한 줄","content":"본문"}')).toBeNull();
  });

  it("INV-G9: 코드 울타리를 벗겨서 읽는다", () => {
    expect(parseDraft("```json\n" + ok + "\n```")?.title).toBe("제목");
  });

  it("INV-G9 (실패경로): 제목이 상한을 넘으면 자르지 않고 비운다", () => {
    // 자르면 문장이 중간에서 끊긴 채로 폼에 들어가고, 사용자는 자기가 쓴 줄 안다.
    const long = "가".repeat(TITLE_MAX + 1);
    const draft = parseDraft(`{"title":"${long}","summary":"한 줄","content":"본문"}`);
    expect(draft?.title).toBe("");
    expect(draft?.summary).toBe("한 줄");
  });

  it("INV-G9 (반대 절반): 상한과 같은 길이는 통과한다", () => {
    const exact = "가".repeat(TITLE_MAX);
    expect(parseDraft(`{"title":"${exact}","summary":"한 줄","content":"본문"}`)?.title).toBe(exact);
  });

  it("INV-G9 (실패경로): 한 줄 소개가 상한을 넘으면 그 칸만 비운다", () => {
    const long = "나".repeat(SUMMARY_MAX + 1);
    const draft = parseDraft(`{"title":"제목","summary":"${long}","content":"본문"}`);
    expect(draft?.summary).toBe("");
    expect(draft?.title).toBe("제목");
  });

  it("INV-G9 (실패경로): 본문이 상한을 넘으면 그 칸만 비운다", () => {
    const long = "다".repeat(CONTENT_MAX + 1);
    const draft = parseDraft(`{"title":"제목","summary":"한 줄","content":"${long}"}`);
    expect(draft?.content).toBe("");
  });

  it("INV-G9: 앞뒤 공백은 없앤다", () => {
    expect(parseDraft('{"title":"  제목  ","summary":"한 줄","content":"본문"}')?.title).toBe("제목");
  });

  it("INV-G9 (실패경로): 세 칸이 다 비면 버린다 — 넣을 것이 없다", () => {
    expect(parseDraft('{"title":"  ","summary":"","content":"\\n"}')).toBeNull();
  });
});

describe("INV-G9: 초안을 폼의 값에 얹을 때 빈 칸은 안 덮는다", () => {
  const current = { title: "내가 쓴 제목", summary: "내가 쓴 소개", content: "내가 쓴 본문" };

  it("INV-G9: 값이 있는 칸은 덮는다", () => {
    const next = applyDraft(current, { title: "초안 제목", summary: "초안 소개", content: "초안 본문" });
    expect(next).toEqual({ title: "초안 제목", summary: "초안 소개", content: "초안 본문" });
  });

  // **칸마다 따로 본다.** 셋을 한 검사로 묶으면 그중 하나만 붙들려 있어도 「잡혔다」가
  // 되고 나머지 갈래는 아무도 안 붙드는데 숫자는 만점이다 — 실제로 제목 갈래가 그랬다
  // (변이 `g9-apply-overwrites` 가 안 잡혔다).
  it("INV-G9 (실패경로): 제목이 비면 사용자가 쓴 제목을 안 지운다", () => {
    const next = applyDraft(current, { title: "", summary: "초안 소개", content: "초안 본문" });
    expect(next.title).toBe("내가 쓴 제목");
  });

  it("INV-G9 (실패경로): 한 줄 소개가 비면 사용자가 쓴 소개를 안 지운다", () => {
    const next = applyDraft(current, { title: "초안 제목", summary: "", content: "초안 본문" });
    expect(next.summary).toBe("내가 쓴 소개");
  });

  it("INV-G9 (실패경로): 본문이 비면 사용자가 쓴 본문을 안 지운다", () => {
    // 상한을 넘어 비워진 칸(`fit`)이 본문을 지우면, 도우미를 눌렀다가 쓰던 글을 잃는다.
    const next = applyDraft(current, { title: "초안 제목", summary: "초안 소개", content: "" });
    expect(next.content).toBe("내가 쓴 본문");
  });

  it("INV-G9: 폼이 비어 있으면 초안이 그대로 들어간다", () => {
    const next = applyDraft({ title: "", summary: "", content: "" }, {
      title: "가", summary: "나", content: "다",
    });
    expect(next).toEqual({ title: "가", summary: "나", content: "다" });
  });
});
