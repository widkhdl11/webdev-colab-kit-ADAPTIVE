import { describe, expect, it } from "vitest";
import { SIGNAL_KEYS } from "@/entities/article";
import { HOT_ISSUE_MAX_TOKENS } from "./budgets";
import { buildHotIssuePrompt } from "./build-hot-issue-prompt";
import { parseHotIssue } from "./parse-hot-issue";
import { HOT_ISSUE_QUESTIONS } from "../model/prompt-text";

const answer = (extra: Record<string, unknown>) =>
  JSON.stringify({ 종류: ["뉴스"], 변화: true, 방향: false, 기회: true, ...extra });

describe("signal 포인트 근거 — hot-issue INV-G2 (2026-09-23)", () => {
  it("INV-G2 (S31c): 참인 질문마다 근거 한 문장을 질문 키와 함께 받는다", () => {
    const v = parseHotIssue(
      answer({ 근거: { 변화: "API 비용이 크게 줄어든다.", 기회: "패치 전까지 노출된 사이트가 먼저 표적이 된다." } }),
    );
    expect(v?.reasons).toEqual({
      변화: "API 비용이 크게 줄어든다.",
      기회: "패치 전까지 노출된 사이트가 먼저 표적이 된다.",
    });
  });

  it("INV-G2 (S31c, 실패경로): 거짓인 질문의 근거는 받지 않는다", () => {
    const v = parseHotIssue(answer({ 근거: { 변화: "비용이 준다.", 방향: "방향이 바뀐다." } }));
    expect(v?.reasons).toEqual({ 변화: "비용이 준다." });
  });

  it("INV-G2 (S31d, 실패경로): 근거가 비었거나 문장이 아니면 그 근거만 버리고 판정은 산다", () => {
    const v = parseHotIssue(answer({ 근거: { 변화: "  ", 기회: "비용 절감" } }));
    expect(v?.importance).toBe(2);
    expect(v?.answers).toEqual({ 변화: true, 방향: false, 기회: true });
    expect(v?.reasons).toEqual({});
  });

  it("INV-G2 실패경로: 근거 칸이 없거나 모양이 틀려도 판정은 산다", () => {
    expect(parseHotIssue(answer({}))?.reasons).toEqual({});
    expect(parseHotIssue(answer({ 근거: "문장." }))?.reasons).toEqual({});
  });

  it("INV-G2: 지시문이 근거 칸과 그 쓰는 법을 싣는다 — 같은 호출이다", () => {
    const prompt = buildHotIssuePrompt({ alreadyPicked: [] });
    expect(prompt).toContain('"근거"');
    expect(prompt).toContain("읽는 사람");
  });

  it("INV-G2: 근거 문장을 더 받으므로 응답 상한이 300 보다 크다 — 300 에서도 잘리고 있었다", () => {
    expect(HOT_ISSUE_MAX_TOKENS).toBeGreaterThan(300);
  });

  it("수집 쪽 질문 키와 화면 쪽 키가 같다 — 어긋나면 화면에 signal 포인트가 안 선다", () => {
    expect(HOT_ISSUE_QUESTIONS.map((q) => q.key)).toEqual([...SIGNAL_KEYS]);
  });
});
