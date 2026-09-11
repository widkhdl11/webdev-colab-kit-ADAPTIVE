import { unfence } from "@/shared/api/model/unfence";
import { CONTENT_MAX, SUMMARY_MAX, TITLE_MAX } from "@/entities/post/model/limits";

/**
 * 모집글 초안 (INV-G9).
 *
 * 추천과 다른 점이 하나 있다. 추천은 모델의 답을 값으로 안 믿어서(후보 id 와 순서만 취한다)
 * 조종당해도 손해가 없는데, **초안은 모델이 만든 문장 자체가 결과물**이라 같은 방어가
 * 안 통한다. 그래서 초안 쪽은 들어가는 쪽을 막는다 — 프롬프트에 요청자 본인이 쓴 글만
 * 넣고(INV-G8), 나온 것은 사용자가 「적용」을 눌러야 폼의 값이 된다(INV-G9).
 */
export type PostDraft = {
  readonly title: string;
  readonly summary: string;
  readonly content: string;
};

/**
 * 상한을 넘으면 **자르지 않고 비운다.**
 *
 * 조용히 자르면 문장이 중간에서 끊긴 채 폼에 들어가고, 사용자는 그것을 자기가 쓴 것으로
 * 보고 발행한다. 비어 있으면 적어도 눈에 띈다.
 */
const fit = (value: string, max: number): string => {
  const trimmed = value.trim();
  // **세는 단위를 `validatePostText` 와 맞춘다**(`entities/post/model/limits.ts`).
  // 코드포인트로 세면 이모지가 든 초안이 여기를 통과하고 폼에 들어간 뒤 제출에서 거부된다 —
  // 「미리보기에서는 됐는데 올리려니 막힌다」가 된다. 저쪽이 상한의 정본이라 저쪽을 따른다.
  return trimmed.length > max ? "" : trimmed;
};

export function parseDraft(raw: string): PostDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(unfence(raw));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const { title, summary, content } = parsed as Record<string, unknown>;
  if (typeof title !== "string" || typeof summary !== "string" || typeof content !== "string") {
    return null;
  }

  const draft: PostDraft = {
    title: fit(title, TITLE_MAX),
    summary: fit(summary, SUMMARY_MAX),
    content: fit(content, CONTENT_MAX),
  };

  // 세 칸이 다 비면 넣을 것이 없다. 「적용」 단추를 눌러도 아무 일도 안 일어나는 상태를
  // 화면에 보여 주느니 실패로 다룬다.
  if (draft.title === "" && draft.summary === "" && draft.content === "") return null;
  return draft;
}

/** 폼이 지금 들고 있는 값 */
export type PostFields = {
  readonly title: string;
  readonly summary: string;
  readonly content: string;
};

/**
 * 초안을 폼의 값에 얹는다 (INV-G9).
 *
 * **빈 칸은 안 덮어쓴다.** 상한을 넘어 비워진 칸(위 `fit`)이 사용자가 이미 적어 둔 본문을
 * 지우면, 도우미를 눌렀다가 쓰던 글을 잃는다. 「빈 문자열은 없는 값」이라는 이 판단이
 * 화면 안에 있으면 유닛으로 판정이 안 되고, 같은 뜻이 미리보기의 「—」와 두 자리로 갈린다.
 */
export function applyDraft(current: PostFields, draft: PostDraft): PostFields {
  return {
    title: draft.title === "" ? current.title : draft.title,
    summary: draft.summary === "" ? current.summary : draft.summary,
    content: draft.content === "" ? current.content : draft.content,
  };
}
