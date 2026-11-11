import { z } from "zod";
import { channelProfileFields, TAG_COUNT_ISSUE, type ChannelProfileBody } from "@/entities/creator/model/channel-profile";
import { tagCountWithin } from "@/entities/creator/model/creator-tags";
import { nicknameSchema } from "@/entities/session/model/nickname-rule";

// 채널 만들기 입력 경계(signup INV-U21) — 닉네임(INV-U13 규칙)·팬덤 이름(선택)·태그 1~5개(creator-tags INV-T3).
// 본문에서 이 네 칸만 꺼낸다 — 계정·크리에이터 ID 는 와도 읽지 않는다(DB 가 로그인 토큰으로 정한다).
// 금칙어·연락처 필터와 닉네임 겹침, 선택지가 있는지는 DB 함수 create_my_channel 이 다시 본다.
// 화면이 「만들기」 전에 미리 볼 때도 같은 스키마를 쓴다 — 규칙과 문구가 한 곳에만 있다.

export const channelCreateInputSchema = z
  .object({
    nickname: nicknameSchema,
    ...channelProfileFields,
  })
  .refine(tagCountWithin, TAG_COUNT_ISSUE);

export type ChannelCreateInput = z.infer<typeof channelCreateInputSchema>;

/** 화면이 보내는 본문 */
export type ChannelCreateBody = { nickname: string } & ChannelProfileBody;

/** 오류가 가리키는 칸. form = 칸이 아닌 오류(이미 만듦·권한) */
export type ChannelCreateField = "nickname" | "fanName" | "tags" | "form";

/** zod 오류 경로 → 칸 */
export function channelFieldOf(path: readonly PropertyKey[]): ChannelCreateField {
  const head = path[0];
  if (head === "nickname") return "nickname";
  if (head === "fanName") return "fanName";
  if (head === "tagIds" || head === "customTag") return "tags";
  return "form";
}

/** 「만들기」 전에 화면에서 미리 본다 — 틀린 첫 칸과 문구, 맞으면 null. 판정은 서버가 다시 한다 */
export function checkChannelCreate(body: ChannelCreateBody): { field: ChannelCreateField; message: string } | null {
  const parsed = channelCreateInputSchema.safeParse(body);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  return { field: channelFieldOf(issue?.path ?? []), message: issue?.message ?? "입력한 정보를 확인해 주세요." };
}
