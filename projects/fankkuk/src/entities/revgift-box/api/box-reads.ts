import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  applicationStatusSchema,
  BOX_VIEWERS,
  boxStatusSchema,
  FAN_BOX_STATES,
  type ApplicationStatus,
  type BoxStatus,
  type BoxViewer,
  type FanBoxState,
} from "../model/box-status";

// 선물함 읽기 (revgift-box INV-GB7·GB9). 누구의 것인지는 DB 읽기 함수가 로그인 토큰으로 정한다 — 주인이 아니면 null.
// 크리에이터에게 보이는 팬 정보는 닉네임·신청 시각·상태뿐이다(INV-GB9). 그 밖의 칸이 섞이면 받지 않는다(strict) —
// DB 가 실수로 칸을 더해도 화면까지 오지 않는다.

type Rpc = Pick<SupabaseClient, "rpc">;

const uuid = z.string().uuid();

export type MyBoxRow = { id: string; name: string; capacity: number; isPublic: boolean; status: BoxStatus; createdAt: string; activeCount: number };
export type BoxApplication = { id: string; nickname: string; appliedAt: string; status: ApplicationStatus };
export type MyBox = {
  id: string;
  name: string;
  capacity: number;
  isPublic: boolean;
  status: BoxStatus;
  inviteToken: string | null;
  createdAt: string;
  applications: BoxApplication[];
};
export type FanBox = { id: string; name: string; creator: { id: string; slug: string; name: string }; open: boolean; viewer: BoxViewer; myState: FanBoxState };
export type CreatorOpenBox = { id: string; name: string };

const myBoxRow = z
  .object({
    id: uuid,
    name: z.string(),
    capacity: z.number().int(),
    is_public: z.boolean(),
    status: boxStatusSchema,
    created_at: z.string(),
    active_count: z.number().int(),
  })
  .strict();

const applicationRow = z.object({ id: uuid, nickname: z.string(), applied_at: z.string(), status: applicationStatusSchema }).strict();

const myBoxSchema = z
  .object({
    id: uuid,
    name: z.string(),
    capacity: z.number().int(),
    is_public: z.boolean(),
    status: boxStatusSchema,
    invite_token: z.string().nullable(),
    created_at: z.string(),
    applications: z.array(applicationRow),
  })
  .strict();

const fanBoxSchema = z
  .object({
    id: uuid,
    name: z.string(),
    creator: z.object({ id: uuid, slug: z.string(), name: z.string() }).strict(),
    open: z.boolean(),
    viewer: z.enum(BOX_VIEWERS),
    my_state: z.enum(FAN_BOX_STATES),
  })
  .strict();

const openBoxRow = z.object({ id: uuid, name: z.string() }).strict();

export async function readMyBoxes(client: Rpc): Promise<MyBoxRow[]> {
  const { data, error } = await client.rpc("my_revgift_boxes");
  if (error) throw new Error(`선물함 목록을 읽지 못했다: ${error.code}`);
  return z
    .array(myBoxRow)
    .parse(data)
    .map((r) => ({ id: r.id, name: r.name, capacity: r.capacity, isPublic: r.is_public, status: r.status, createdAt: r.created_at, activeCount: r.active_count }));
}

/** 신청 관리 창 — 주인 본인의 선물함 하나. 없거나 주인이 아니면 null */
export async function readMyBox(client: Rpc, boxId: string): Promise<MyBox | null> {
  if (!uuid.safeParse(boxId).success) return null;
  const { data, error } = await client.rpc("my_revgift_box", { p_box_id: boxId });
  if (error) throw new Error(`선물함을 읽지 못했다: ${error.code}`);
  if (data === null) return null;
  const b = myBoxSchema.parse(data);
  return {
    id: b.id,
    name: b.name,
    capacity: b.capacity,
    isPublic: b.is_public,
    status: b.status,
    inviteToken: b.invite_token,
    createdAt: b.created_at,
    applications: b.applications.map((a) => ({ id: a.id, nickname: a.nickname, appliedAt: a.applied_at, status: a.status })),
  };
}

/** 팬이 보는 선물함 하나 — 비공개는 맞는 초대 토큰이 있어야 하고, 아니면 없는 선물함과 같이 null(INV-GB4) */
export async function readBoxForFan(client: Rpc, boxId: string, token: string | null): Promise<FanBox | null> {
  if (!uuid.safeParse(boxId).success) return null;
  const { data, error } = await client.rpc("revgift_box_for_fan", { p_box_id: boxId, p_token: token });
  if (error) throw new Error(`선물함을 읽지 못했다: ${error.code}`);
  if (data === null) return null;
  const b = fanBoxSchema.parse(data);
  return { id: b.id, name: b.name, creator: b.creator, open: b.open, viewer: b.viewer, myState: b.my_state };
}

/** 크리에이터 상세의 입구 — 그 크리에이터의 공개·신청 받는 중인 선물함 */
export async function readCreatorOpenBoxes(client: Rpc, creatorId: string): Promise<CreatorOpenBox[]> {
  const { data, error } = await client.rpc("creator_open_revgift_boxes", { p_creator_id: creatorId });
  if (error) throw new Error(`선물함 입구를 읽지 못했다: ${error.code}`);
  return z.array(openBoxRow).parse(data);
}
