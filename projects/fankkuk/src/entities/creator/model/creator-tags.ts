import { z } from "zod";
import { charCount } from "@/shared/lib/validation/char-count";
import { HIDDEN_CHAR } from "@/shared/lib/validation/hidden-char";

// 크리에이터 태그 (docs/specs/creator-tags.md). 선택지는 운영자가 관리하는 이름 목록이고, 크리에이터는 여러 개 + 직접 입력 한 개를 고른다.
// 화면과 앱 서버가 먼저 보고, 최종 판정은 DB 함수(update_my_creator_tags·create_creator_account)가 같은 규칙으로 다시 한다(INV-T3).

/** INV-T3: 한 크리에이터의 태그는 합쳐 1~5개. */
export const TAG_TOTAL_MAX = 5;
/** INV-T3: 직접 입력은 앞뒤 공백을 뺀 1~20자. 선택지 이름도 같은 길이. */
export const TAG_CUSTOM_MAX = 20;

/** 고를 수 있는(숨기지 않은) 선택지 한 개. 목록은 선택지 순서다. */
export type TagOption = { id: string; name: string };

/** 선택지 이름 비교 — 앞뒤 공백을 빼고 영문 대소문자를 무시한다(DB 의 creator_tag_key 와 같다). */
export function tagKey(text: string): string {
  return text.trim().toLowerCase();
}

/** 직접 입력의 꼴 — 앞뒤 공백을 뺀 1~20자, 보이지 않는 글자 없음. 틀리면 화면 문구. */
function customTagProblem(custom: string): string | null {
  if (charCount(custom) > TAG_CUSTOM_MAX) return `직접 입력은 ${TAG_CUSTOM_MAX}자까지 적을 수 있어요.`;
  if (HIDDEN_CHAR.test(custom)) return "직접 입력에 보이지 않는 글자나 줄바꿈은 쓸 수 없어요.";
  return null;
}

export const TAG_COUNT_MESSAGE = `태그를 1~${TAG_TOTAL_MAX}개 골라 주세요.`;

export type TagSelection = { ok: true; tagIds: string[]; customTag: string | null; count: number } | { ok: false; message: string };

/**
 * S3c: 직접 입력(앞뒤 공백을 뺀 값)을 고른 선택지와 합친다 — 선택지 이름과 같으면(tagKey) 그 선택지를 고른 것으로, 이미 골랐으면 한 번만.
 * 꼴 검사는 하지 않는다(부르는 쪽 몫).
 */
function mergeCustomTag(options: readonly TagOption[], picked: readonly string[], custom: string): { tagIds: string[]; customTag: string | null } {
  const tagIds = [...picked];
  if (custom === "") return { tagIds, customTag: null };
  const same = options.find((o) => tagKey(o.name) === tagKey(custom));
  if (!same) return { tagIds, customTag: custom };
  if (!tagIds.includes(same.id)) tagIds.push(same.id);
  return { tagIds, customTag: null };
}

/**
 * INV-T3: 화면에 보일 「지금 몇 개」 — 저장할 때(resolveTagSelection)와 같은 셈이다. 같은 선택지를 두 번 고른 것과
 * 고른 선택지와 같은 이름의 직접 입력은 하나로 센다. 꼴이 틀리거나 개수가 넘쳐도 센다(그 판정은 resolveTagSelection).
 */
export function countTagSelection(options: readonly TagOption[], picked: readonly string[], customInput: string): number {
  const { tagIds, customTag } = mergeCustomTag(options, [...new Set(picked)], customInput.trim());
  return tagIds.length + (customTag === null ? 0 : 1);
}

/**
 * INV-T4: 찾기·메인에서 칩 하나를 골랐을 때 이 크리에이터가 보이는지 — 그 태그를 가졌으면. tag = null 은 「전체」(누구나 보인다).
 */
export function hasPickedTag(card: { tags: readonly string[] }, tag: string | null): boolean {
  return tag === null || card.tags.includes(tag);
}

/**
 * INV-T3: 화면에서 고른 선택지와 직접 입력을 저장할 값으로 바꾼다. options = 고를 수 있는 선택지(숨긴 것은 없다).
 * 직접 입력이 선택지 이름과 같으면 그 선택지를 고른 것으로 센다(S3c, DB 와 같다). 어기면 문구.
 */
export function resolveTagSelection(options: readonly TagOption[], picked: readonly string[], customInput: string): TagSelection {
  if (new Set(picked).size !== picked.length) return { ok: false, message: "같은 태그를 두 번 고를 수 없어요." };
  if (!picked.every((id) => options.some((o) => o.id === id))) return { ok: false, message: "고를 수 없는 태그가 있어요. 새로 고침해 주세요." };
  const custom = customInput.trim();
  if (custom !== "") {
    const problem = customTagProblem(custom);
    if (problem) return { ok: false, message: problem };
  }
  const { tagIds, customTag } = mergeCustomTag(options, picked, custom);
  const count = tagIds.length + (customTag === null ? 0 : 1);
  if (count < 1 || count > TAG_TOTAL_MAX) return { ok: false, message: TAG_COUNT_MESSAGE };
  return { ok: true, tagIds, customTag, count };
}

/**
 * 앱 서버가 받는 태그 입력 칸(INV-T3) — 다른 입력 꼴에 섞어 쓸 수 있게 칸과 개수 검사를 따로 둔다.
 * 선택지가 숨겨졌는지·있는지는 DB 가 본다. customTag 는 앞뒤 공백을 뺀 값(없으면 "").
 */
export const tagSelectionFields = {
    tagIds: z
      .array(z.guid())
      .max(TAG_TOTAL_MAX, TAG_COUNT_MESSAGE)
      .refine((ids) => new Set(ids).size === ids.length, "같은 태그를 두 번 고를 수 없어요."),
    customTag: z
      .string()
      .trim()
      .superRefine((s, ctx) => {
        const problem = s === "" ? null : customTagProblem(s);
        if (problem) ctx.addIssue({ code: "custom", message: problem });
      }),
};

/**
 * INV-T3: 앱 서버가 볼 수 있는 만큼의 개수 검사 — 선택지 0~5개(tagIds 의 max), 합쳐 1개 이상.
 * 직접 입력이 고른 선택지와 같은 이름이면 화면(resolveTagSelection)과 DB 가 하나로 합친다. 앱 서버는 선택지 이름을 모르므로
 * 「선택지 5개 + 직접 입력 1개」를 여기서 6개로 세어 거부하지 않는다 — 겹치지 않는 6개는 DB 가 거부한다(22023, 아무것도 안 바뀜).
 */
export function tagCountWithin(v: { tagIds: readonly string[]; customTag: string }): boolean {
  return v.tagIds.length + (v.customTag === "" ? 0 : 1) >= 1;
}

export const tagSelectionSchema = z.object(tagSelectionFields).refine(tagCountWithin, TAG_COUNT_MESSAGE);

/**
 * INV-T4: 찾기·메인의 칩 — 고를 수 있는 선택지 가운데 그 태그를 가진 크리에이터가 1명 이상인 것만, 선택지 순서대로.
 * cards = 공개 목록의 크리에이터(태그는 DB 가 숨기지 않은 선택지 이름만 준다). 선택지 목록에 없는 말은 칩이 되지 않는다.
 */
export function tagChips(options: readonly TagOption[], cards: readonly { tags: readonly string[] }[]): string[] {
  const used = new Set(cards.flatMap((c) => c.tags));
  return options.filter((o) => used.has(o.name)).map((o) => o.name);
}

/** 운영자 선택지 목록 한 줄 — 숨긴 것도 보인다. creatorCount = 이 선택지를 고른 크리에이터 수(숨긴 동안에도 기록은 남는다, INV-T6). */
export type AdminTagOption = { id: string; name: string; hidden: boolean; creatorCount: number };

/** 운영자 「직접 입력한 태그」 한 줄 — 같은 말(tagKey)끼리 묶은 인원수. */
export type CustomTagCount = { tag: string; creatorCount: number };

/**
 * creator-tags INV-T7: DB 필터의 거부 사유(오류 코드) → 화면 문구. 필터 사유가 아니면 null.
 * P0081 금칙어 · P0082 전화번호·이메일·인터넷 주소 꼴 · P0083 글자·숫자 없음. 어느 금칙어에 걸렸는지는 말하지 않는다.
 */
const TAG_FILTER_MESSAGES: Record<string, string> = {
  P0081: "쓸 수 없는 말이 들어 있어요. 다른 말로 적어 주세요.",
  P0082: "전화번호·이메일·인터넷 주소는 태그에 쓸 수 없어요.",
  P0083: "글자나 숫자를 넣어 적어 주세요.",
};

export function tagFilterMessage(code: string | undefined): string | null {
  return code !== undefined && Object.hasOwn(TAG_FILTER_MESSAGES, code) ? TAG_FILTER_MESSAGES[code]! : null;
}

/** creator-tags INV-T8: 운영자 화면의 금칙어 한 줄 */
export type BannedWord = { id: string; word: string };
