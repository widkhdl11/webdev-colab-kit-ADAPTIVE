import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { CreatorSettingsView } from "../model/creator-settings";

// 로그인한 크리에이터의 공개 이름·소개글·찾기 노출(my_creator_settings)과 알림 두 칸(my_account)을 읽는다.
// 두 함수 모두 인자 없이 로그인 토큰의 계정 것만 돌려준다. 응답은 신뢰 경계 밖이라 형식을 검사한다.

const settingsRow = z.object({ name: z.string(), intro: z.string(), searchable: z.boolean() });
const accountRow = z.object({ notify_kakao: z.boolean(), notify_email: z.boolean() });

/** 크리에이터 줄이 없으면 null(크리에이터 역할이 아니거나 줄이 없다 — 부르는 쪽이 오류로 드러낸다). */
export async function readMyCreatorSettings(client: Pick<SupabaseClient, "rpc">): Promise<CreatorSettingsView | null> {
  const [settings, account] = await Promise.all([client.rpc("my_creator_settings"), client.rpc("my_account")]);
  if (settings.error) throw new Error(`크리에이터 설정을 읽지 못했다: ${settings.error.code}`);
  if (account.error) throw new Error(`알림 설정을 읽지 못했다: ${account.error.code}`);
  const s = z.array(settingsRow).parse(settings.data)[0];
  const a = z.array(accountRow.passthrough()).parse(account.data)[0];
  if (!s || !a) return null;
  return { publicName: s.name, intro: s.intro, visibleInSearch: s.searchable, notify: { kakao: a.notify_kakao, email: a.notify_email } };
}
