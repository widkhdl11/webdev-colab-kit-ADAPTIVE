import type { SupabaseClient } from "@supabase/supabase-js";
import { CV } from "./creator-verification-helpers";
import { adminClient, psql, signedInClient } from "./helpers";

// 선물 링크 페이지(creator-link) 시험 도구 — DB 시험(creator-link-db)과 주소·이미지 라우트 시험(creator-link-routes)이 같이 쓴다.
// 크리에이터는 본인 확인 시험 계정(cvt_*) — 시험 동안만 확인된 상태로 둔다. 주문은 psql 로 바로 넣는다(물품 이름 「시험 선물」 — deleteTestOrders 가 같이 지운다).

export const LINK_CREATORS = [CV.haru, CV.summer, CV.ggul, CV.dawn];
const IDS = LINK_CREATORS.map((c) => `'${c.creatorId}'`).join(", ");
export const PHOTO_BUCKET_NAME = "creator-photos";

export function verifyCreator(creatorId: string, slug: string): void {
  psql(
    `begin; set local session_replication_role = replica; update public.creators set identity_verified = true, searchable = true, channel = 'https://www.youtube.com/@${slug}' where id = '${creatorId}'; commit;`,
  );
}

/** 아이디 표·잠금·사진 칸·소개를 되돌린다 — 표·칸이 없을 때(구현 전 빨간불)도 멈추지 않게. */
export function resetLink(): void {
  psql(
    [
      "begin;",
      "set local session_replication_role = replica;",
      "do $$ begin",
      `if to_regclass('public.creator_handles') is not null then execute $q$delete from public.creator_handles where creator_id in (${IDS})$q$; end if;`,
      `if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'creators' and column_name = 'photo_path') then
         execute $q$update public.creators set handle_changed_at = null, photo_path = null, photo_version = 0 where id in (${IDS})$q$;
       end if;`,
      `update public.creators set intro = '' where id in (${IDS});`,
      "end $$;",
      "commit;",
    ].join(" "),
  );
}

export async function clearPhotos(): Promise<void> {
  const admin = adminClient();
  for (const c of LINK_CREATORS) {
    const listed = await admin.storage.from(PHOTO_BUCKET_NAME).list(c.creatorId);
    const names = (listed.data ?? []).map((f) => `${c.creatorId}/${f.name}`);
    if (names.length > 0) await admin.storage.from(PHOTO_BUCKET_NAME).remove(names);
  }
}

const clients = new Map<string, SupabaseClient>();
/** 로그인한 클라이언트 — 계정마다 한 번만 로그인한다. */
export async function linkClient(login: string): Promise<SupabaseClient> {
  const hit = clients.get(login);
  if (hit) return hit;
  const c = await signedInClient(login);
  clients.set(login, c);
  return c;
}

export async function setHandle(login: string, handle: string) {
  return (await linkClient(login)).rpc("update_my_creator_handle", { p_handle: handle });
}

export async function setHandleOk(login: string, handle: string): Promise<string> {
  const r = await setHandle(login, handle);
  if (r.error) throw new Error(`아이디 저장 실패: ${r.error.code} ${r.error.message}`);
  return r.data as string;
}

/** 잠금을 풀어 다음 바꾸기를 허용한다(30일이 지난 것처럼). */
export function unlockHandle(creatorId: string): void {
  psql(`update public.creators set handle_changed_at = now() - interval '31 days' where id = '${creatorId}'`);
}

let seq = 0;
function orderNo(): string {
  seq += 1;
  return `FC-L${Date.now().toString(36).toUpperCase().slice(-4)}${seq}`.slice(0, 13);
}

/** 상태·결제 시각을 정해 주문을 바로 넣는다. registeredAt 은 SQL 식(null 이면 결제 전). */
export function insertOrder(
  fanId: string,
  creatorId: string,
  status: string,
  registeredAt: string | null,
  extra: { waybill?: string; tracking?: string } = {},
): string {
  const no = orderNo();
  psql(
    `begin; set local session_replication_role = replica;
     insert into public.orders (order_no, fan_id, creator_id, item_kind, has_electronics_or_metal, status, registered_at, outbound_waybill_no, fan_tracking_no)
     values ('${no}', '${fanId}', '${creatorId}', '시험 선물', false, '${status}', ${registeredAt ?? "null"}, ${extra.waybill ? `'${extra.waybill}'` : "null"}, ${extra.tracking ? `'${extra.tracking}'` : "null"});
     commit;`,
  );
  return no;
}
