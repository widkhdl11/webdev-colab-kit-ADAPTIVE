import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { creatorColorOrNull } from "../model/creator-color";
import type { CreatorSettingsView } from "../model/creator-settings";

// 로그인한 크리에이터의 공개 이름·소개글·찾기 노출·태그·팬덤 이름·테마 색(my_creator_settings — 직접 입력은 본인에게만, creator-tags INV-T4)와 알림 두 칸·가린 휴대폰 번호(my_account)를 읽는다.
// 두 함수 모두 인자 없이 로그인 토큰의 계정 것만 돌려준다. 응답은 신뢰 경계 밖이라 형식을 검사한다.

const settingsRow = z.object({
  name: z.string(),
  intro: z.string(),
  searchable: z.boolean(),
  tag_ids: z.array(z.guid()),
  custom_tag: z.string().nullable(),
  fan_name: z.string().nullable(),
  personal_color: z.string().nullable(),
});
const accountRow = z.object({
  notify_kakao: z.boolean(),
  notify_email: z.boolean(),
  phone_masked: z.string().regex(/^01\d-\*{4}-\d{4}$/).nullable(),
});

/** 크리에이터 줄이 없으면 null(크리에이터 역할이 아니거나 줄이 없다 — 부르는 쪽이 오류로 드러낸다). */
export async function readMyCreatorSettings(client: Pick<SupabaseClient, "rpc">): Promise<CreatorSettingsView | null> {
  const [settings, account] = await Promise.all([client.rpc("my_creator_settings"), client.rpc("my_account")]);
  if (settings.error) throw new Error(`크리에이터 설정을 읽지 못했다: ${settings.error.code}`);
  if (account.error) throw new Error(`알림 설정을 읽지 못했다: ${account.error.code}`);
  const s = z.array(settingsRow).parse(settings.data)[0];
  const a = z.array(accountRow).parse(account.data)[0];
  if (!s || !a) return null;
  return {
    publicName: s.name,
    intro: s.intro,
    visibleInSearch: s.searchable,
    tagIds: s.tag_ids,
    customTag: s.custom_tag ?? "",
    fanName: s.fan_name ?? "",
    // creator-link INV-E13: 8색 밖 값은 없는 것(기본 모양)으로. 팬컬러는 읽지 않는다(고르지도 그리지도 않는다)
    colors: { personal: creatorColorOrNull(s.personal_color) },
    notify: { kakao: a.notify_kakao, email: a.notify_email },
    phoneMasked: a.phone_masked,
  };
}
