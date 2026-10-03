import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { CreatorRelation } from "../model/sender-rule";

// 보내는 크리에이터(계정)와 받는 크리에이터 사이를 관리자 키로 읽는다 — 선물 등록 서버 판정용(INV-L8·INV-L9).
// DB 등록 함수도 같은 판정을 따로 한다. 여기는 앱 서버 쪽 장치라 DB 함수를 부르지 않고 표를 직접 읽는다
// (한쪽 판정에 실수가 있어도 다른 쪽이 남게).

// 응답은 신뢰 경계 밖이라 형식을 검사한다
const receiverSchema = z.object({ profile_id: z.string().uuid().nullable() });
const pageSchema = z.array(z.object({ id: z.string().uuid() }));

export type CreatorRelationReader = (senderId: string, creatorId: string) => Promise<CreatorRelation | null>;

export function createCreatorRelationReader(admin: Pick<SupabaseClient, "from">): CreatorRelationReader {
  return async (senderId, creatorId) => {
    const receiver = await admin.from("creators").select("profile_id").eq("id", creatorId).maybeSingle();
    if (receiver.error) throw new Error(`받는 크리에이터를 읽지 못했다: ${receiver.error.code}`);
    // 없는 크리에이터면 null — 등록 판정이 「받을 수 없는 크리에이터」(404)로 거부한다
    if (!receiver.data) return null;
    const receiverProfileId = receiverSchema.parse(receiver.data).profile_id;
    if (receiverProfileId === senderId) return { receiverIsSelf: true, followEitherWay: false };

    const outgoing = await admin
      .from("follows")
      .select("creator_id", { count: "exact", head: true })
      .eq("fan_id", senderId)
      .eq("creator_id", creatorId);
    if (outgoing.error) throw new Error(`팔로우를 읽지 못했다: ${outgoing.error.code}`);
    if ((outgoing.count ?? 0) > 0) return { receiverIsSelf: false, followEitherWay: true };
    if (!receiverProfileId) return { receiverIsSelf: false, followEitherWay: false };

    const senderPages = await admin.from("creators").select("id").eq("profile_id", senderId);
    if (senderPages.error) throw new Error(`보내는 크리에이터를 읽지 못했다: ${senderPages.error.code}`);
    const pageIds = pageSchema.parse(senderPages.data).map((r) => r.id);
    if (pageIds.length === 0) return { receiverIsSelf: false, followEitherWay: false };

    const incoming = await admin
      .from("follows")
      .select("creator_id", { count: "exact", head: true })
      .eq("fan_id", receiverProfileId)
      .in("creator_id", pageIds);
    if (incoming.error) throw new Error(`팔로우를 읽지 못했다: ${incoming.error.code}`);
    return { receiverIsSelf: false, followEitherWay: (incoming.count ?? 0) > 0 };
  };
}
