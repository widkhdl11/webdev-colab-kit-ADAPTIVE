import { SOURCES } from "../model/sources";
import type { Source } from "../model/types";

export interface SourcePresentation {
  /** 화면 표시명 — 설정의 `displayName` → `name` → 항목이 들고 온 이름 순. */
  displayName: string;
  /**
   * 원문이 어떤 글인가 — 「원문 보기 (…)」 괄호 안에 들어가는 말. 예: `영어`, `Hada 정리, 한국어`.
   * 설정에 없는 소스면 null — 모르는 것을 지어내지 않는다(라벨은 괄호 없이 선다).
   */
  originalNote: string | null;
  /**
   * 원문 본문의 언어 태그 — 원문 영역의 `lang` 에 건다. 스크린리더가 영어 원문을 한국어 발음으로
   * 읽지 않게 한다. 설정에 없는 소스면 null — 틀린 lang 은 없는 것보다 나쁘다(발음을 잘못 바꾼다).
   */
  originalLang: "en" | "ko" | null;
}

/** 설정의 원문 언어(사람이 읽는 말) → 언어 태그. */
const LANG_TAGS = { 영어: "en", 한국어: "ko" } as const;

/**
 * 출처를 화면에 어떻게 부르나 (2026-09-23 상세 화면 재구성).
 *
 * 항목에 저장된 출처 이름은 피드가 준 글자라(`Openai`) 화면은 설정을 먼저 본다.
 * 설정에서 빠진 소스(옛 항목의 소스를 지운 경우)는 항목의 이름을 그대로 쓴다.
 */
export function sourcePresentation(
  sourceId: string,
  storedName: string,
  sources: readonly Source[] = SOURCES,
): SourcePresentation {
  const s = sources.find((x) => x.id === sourceId);
  if (s === undefined) return { displayName: storedName, originalNote: null, originalLang: null };
  return {
    displayName: s.displayName ?? s.name,
    originalNote: s.original.note ? `${s.original.note}, ${s.original.lang}` : s.original.lang,
    originalLang: LANG_TAGS[s.original.lang],
  };
}
