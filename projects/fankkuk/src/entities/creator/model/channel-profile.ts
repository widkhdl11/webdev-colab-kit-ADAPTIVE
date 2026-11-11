import { z } from "zod";
import { charCount } from "@/shared/lib/validation/char-count";
import { HIDDEN_CHAR, LINE_BREAK } from "@/shared/lib/validation/hidden-char";
import { TAG_COUNT_MESSAGE, tagCountWithin, tagSelectionFields } from "./creator-tags";
import { FAN_NAME_MAX } from "./fan-name";

// 채널 공개 정보 — 채널 만들기(signup INV-U21)에서 닉네임과 함께 받는 팬덤 이름(선택)·태그 1~5개(creator-tags INV-T3).
// 2026-11-11 가입 2단계에서 채널 만들기로 옮겼다 — 규칙과 문구는 그대로다. DB 함수 create_my_channel 이 같은 기준으로 다시 검사한다
// (선택지가 있는지·숨겼는지, 금칙어·연락처 필터 P0084~P0086 은 DB 가 본다).
// 채널이 없는 크리에이터는 선물함·팬꾹 링크·채널 확인 요청을 DB 가 거부한다(FKN01) — 그 문구도 여기 한 곳에 둔다.

/** DB 오류 코드: 채널을 먼저 만들어야 한다(선물함·팬꾹 링크·채널 확인 요청 — INV-U21) */
export const CHANNEL_REQUIRED_CODE = "FKN01";
/** DB 오류 코드: 이미 채널을 만들었다(채널 만들기는 한 번) */
export const CHANNEL_EXISTS_CODE = "FKN02";

export const CHANNEL_REQUIRED_MESSAGE = "채널을 먼저 만들어 주세요.";
export const CHANNEL_EXISTS_MESSAGE = "이미 채널을 만들었습니다.";

/** 팬덤 이름이 DB 필터에 걸렸을 때(P0084~P0086) — 채널 만들기·상세 설정이 같은 문구를 쓴다 */
export const FAN_NAME_FILTER_MESSAGES: Readonly<Record<string, string>> = {
  P0084: "팬덤 이름에 사용할 수 없는 표현이 포함되어 있습니다.",
  P0085: "팬덤 이름에 전화번호·이메일·인터넷 주소는 입력할 수 없습니다.",
  P0086: "팬덤 이름에 글자나 숫자를 하나 이상 넣어 주세요.",
};

/** 팬덤 이름 필터 코드 → 문구. 팬덤 이름 사유가 아니면 null */
export function fanNameFilterMessage(code: string | undefined): string | null {
  return code !== undefined && Object.hasOwn(FAN_NAME_FILTER_MESSAGES, code) ? FAN_NAME_FILTER_MESSAGES[code]! : null;
}

/** DB 가 고를 수 없는 태그로 거부했을 때(22023 — 그 사이 숨긴 선택지 등, creator-tags INV-T3) */
export const TAG_UNAVAILABLE_MESSAGE = "선택할 수 없는 태그가 포함되어 있습니다. 새로고침한 뒤 다시 선택해 주세요.";

/** 팬덤 이름 칸 + 태그 칸. 팬덤 이름은 선택, 0~10자 — 내 팬꾹 꾸미기의 「팬을 부르는 이름」과 같은 칸(creators.fan_name)·같은 규칙 */
export const channelProfileFields = {
  ...tagSelectionFields,
  fanName: z
    .string()
    .trim()
    .refine((s) => charCount(s) <= FAN_NAME_MAX, `팬덤 이름은 ${FAN_NAME_MAX}자까지 입력할 수 있습니다.`)
    .refine((s) => !HIDDEN_CHAR.test(s) && !LINE_BREAK.test(s), "팬덤 이름에 줄바꿈이나 보이지 않는 문자는 입력할 수 없습니다.")
    .optional(),
};

/** 태그는 합쳐 1~5개(tagCountWithin) — 오류는 태그 칸(tagIds)을 가리킨다 */
export const TAG_COUNT_ISSUE = { message: TAG_COUNT_MESSAGE, path: ["tagIds"] };

export const channelProfileSchema = z.object(channelProfileFields).refine(tagCountWithin, TAG_COUNT_ISSUE);

/** 화면이 보내는 채널 공개 정보 — 태그는 고른 선택지 id 와 직접 입력(없으면 "") */
export type ChannelProfileBody = { tagIds: readonly string[]; customTag: string; fanName?: string };
