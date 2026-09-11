import { CONTENT_MAX, SUMMARY_MAX, TITLE_MAX } from "@/entities/post/model/limits";
import type { Prompt } from "@/shared/api/model/provider";

/**
 * 초안 도우미가 모델에 보내는 것 (INV-G8).
 *
 * **여기 들어가는 글자는 전부 요청한 본인이 쓴 것이다.** 폼에서 고른 스터디의 제목·설명이고,
 * 그 스터디가 본인 것이라는 보장은 서버가 확인한다(`api/draft-post.ts`).
 * 그래서 프롬프트를 조종해도 조종당하는 사람이 자기 자신이라 사고가 성립하지 않는다.
 *
 * 그래도 지시문과 데이터를 나누는 것은 추천과 같다 — 나중에 남이 쓴 글자가 이 프롬프트에
 * 들어오게 되는 날(예: 참고할 다른 모집글을 같이 보내는 날) 경계가 이미 있어야 한다.
 */
export type StudyForDraft = {
  readonly title: string;
  readonly description: string | null;
  readonly categoryName: string;
  readonly regionName: string;
  readonly meetingMode: string;
  readonly capacity: number;
  /** 상세 위치. 온라인이면 비어 있다 */
  readonly locationDetail: string | null;
  /** 모임 시간. 스펙의 INV-G8 이 근거에 「일정」을 적어 두었다 */
  readonly slots: readonly { readonly weekday: number; readonly startsAt: string }[];
};

const INSTRUCTION = [
  "너는 스터디 모집글의 초안을 쓰는 도구다.",
  "아래 JSON 은 요청한 사람이 직접 만든 스터디의 정보다.",
  "이 정보만 가지고 모집글 초안을 한국어로 쓴다.",
  "",
  "규칙:",
  '- 오직 {"title": "...", "summary": "...", "content": "..."} 형태의 JSON 만 출력한다.',
  `- title 은 ${TITLE_MAX}자 이내, summary 는 ${SUMMARY_MAX}자 이내, content 는 ${CONTENT_MAX}자 이내.`,
  "- summary 는 목록 카드에 한 줄로 나가는 문장이다. 한 문장으로 쓴다.",
  "- **주어진 정보에 없는 것을 지어내지 않는다.** 모임 시간·장소·준비물·참가비를 새로",
  "  만들지 않는다. 정보가 모자라면 그 얘기를 아예 안 쓴다.",
  "- 없는 실적(수강생 수·후기·합격률)을 쓰지 않는다.",
].join("\n");

export function buildDraftPrompt(study: StudyForDraft): Prompt {
  return {
    instruction: INSTRUCTION,
    data: JSON.stringify({ study }),
  };
}
