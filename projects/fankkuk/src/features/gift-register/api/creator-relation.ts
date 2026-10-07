import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { CreatorRelation } from "../model/sender-rule";

// 보내는 사람(팬·크리에이터 계정)과 받는 크리에이터 사이를 관리자 키로 읽는다 — 선물 등록 서버 판정용(INV-L8·INV-L9).
// DB 등록 함수도 같은 판정을 따로 한다. 여기는 앱 서버 쪽 장치라 DB 함수를 부르지 않고 표를 직접 읽는다
// (한쪽 판정에 실수가 있어도 다른 쪽이 남게).
// INV-L9(2026-10-07 바뀜): 보내는 사람이 받는 크리에이터를 팔로우했는지만 센다 — 받는 쪽이 보내는 쪽을 팔로우한 것은 세지 않는다.

// 응답은 신뢰 경계 밖이라 형식을 검사한다
const receiverSchema = z.object({ profile_id: z.string().uuid().nullable() });

export type CreatorRelationReader = (senderId: string, creatorId: string) => Promise<CreatorRelation | null>;

export function createCreatorRelationReader(admin: Pick<SupabaseClient, "from">): CreatorRelationReader {
  return async (senderId, creatorId) => {
    const receiver = await admin.from("creators").select("profile_id").eq("id", creatorId).maybeSingle();
    if (receiver.error) throw new Error(`받는 크리에이터를 읽지 못했다: ${receiver.error.code}`);
    // 없는 크리에이터면 null — 등록 판정이 「받을 수 없는 크리에이터」(404)로 거부한다
    if (!receiver.data) return null;
    if (receiverSchema.parse(receiver.data).profile_id === senderId) return { receiverIsSelf: true, senderFollows: false };

    const follow = await admin
      .from("follows")
      .select("creator_id", { count: "exact", head: true })
      .eq("fan_id", senderId)
      .eq("creator_id", creatorId);
    if (follow.error) throw new Error(`팔로우를 읽지 못했다: ${follow.error.code}`);
    return { receiverIsSelf: false, senderFollows: (follow.count ?? 0) > 0 };
  };
}
