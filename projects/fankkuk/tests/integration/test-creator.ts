import { linkTestSignature, psql } from "./helpers";

// 주소 칸을 건드리는 시험 전용 크리에이터 — 시드 크리에이터(하루)의 진짜 주소 봉투를 시험이 덮어쓰지 않게 한다.
// 2026-10-06: 하루의 봉투를 저장했다 되돌리는 방식이었는데, 실행이 끊기거나 둘이 겹치면 시험 키로 만든 봉투가 남아
// 화면의 송장 출력이 실패했다(FC-5KGDZ). 이제 시험은 이 크리에이터의 칸만 쓰고, 끝나면(또는 다음 실행 시작 때) 통째로 지운다.
//
// 로그인 아이디는 시드 계정과 같은 꼴(<아이디>@fankkuk.test, 비밀번호 fankkuk-local-1234)이라 signedInClient 로 로그인된다.
// 본인 확인을 마친 크리에이터여야 선물을 받을 수 있다(register_order).

export const TEST_CREATOR = {
  profileId: "00000000-0000-4000-a000-0000000000e1",
  creatorId: "00000000-0000-4000-b000-0000000000e1",
  loginId: "it_address_creator",
  slug: "it-address-creator",
} as const;

/** 시험 전용 크리에이터를 만든다(이미 있으면 그대로 둔다). */
export function createTestCreator(): void {
  const { profileId, creatorId, loginId, slug } = TEST_CREATOR;
  psql(
    [
      "begin;",
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
       values ('00000000-0000-0000-0000-000000000000', '${profileId}', 'authenticated', 'authenticated', '${loginId}@fankkuk.test',
               extensions.crypt('fankkuk-local-1234', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
       on conflict (id) do nothing;`,
      `insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
       values ('${profileId}', '${profileId}', jsonb_build_object('sub', '${profileId}', 'email', '${loginId}@fankkuk.test', 'email_verified', true), 'email', now(), now(), now())
       on conflict do nothing;`,
      `insert into public.profiles (id, login_id, nickname, role) values ('${profileId}', '${loginId}', '시험주소', 'creator') on conflict (id) do nothing;`,
      // 확인된 크리에이터는 승인 함수로만 생긴다(INV-V6 트리거) — 시험 준비라 이 한 줄만 트리거를 끄고 넣는다(시드와 같은 처지).
      "set local session_replication_role = replica;",
      `insert into public.creators (id, profile_id, slug, name, channel, identity_verified) values ('${creatorId}', '${profileId}', '${slug}', '시험주소', '치지직', true) on conflict (id) do nothing;`,
      "set local session_replication_role = origin;",
      "commit;",
    ].join(" "),
  );
  // 선물을 받으려면 승인 서명도 연결돼 있어야 한다(approval-signature INV-S16) — 시험 서명(fake)으로
  linkTestSignature(creatorId);
}

// 시험 크리에이터(또는 그 프로필)를 가리키는 줄 중 지우지 않으면 크리에이터·로그인 정보 줄이 지워지지 않거나(참조가 막음)
// 다음 실행에 옛 기록이 섞이는 것들. 표가 아직 없는 DB(구현 전 빨간불 확인)에서도 정리가 멈추지 않게 표가 있을 때만 지운다.
// 추가만 되는 기록 표(이름 바꾼 기록 등)는 트리거를 끈 구간에서 지운다.
const CREATOR_REFS = [
  "public.creator_name_changes",
  "public.creator_blocks",
  "public.creator_channel_claims",
  "public.creator_verification_events",
  "public.office_hold_alerts",
  "public.follows",
] as const;
const PROFILE_REFS = [
  ["public.creator_channel_claims", "account_id"],
  ["public.creator_verification_applications", "account_id"],
  ["public.creator_verification_unlocks", "account_id"],
  ["public.notification_outbox", "account_id"],
] as const;

/**
 * 시험 전용 크리에이터와 그 주소·주소 기록, 그리고 이 크리에이터를 가리키는 기록 줄(위 목록)을 지운다.
 * 시험 주문(deleteTestOrders)을 먼저 지워야 크리에이터 줄이 지워진다.
 * 한계: 역조공(revgift_sends·revgift_shares)·주문(orders)은 여기서 지우지 않는다 — 이 크리에이터로 역조공을 만드는 시험은 아직 없고,
 * 주문은 deleteTestOrders 가 맡는다. 남아 있으면 참조 때문에 크리에이터 줄 지우기가 실패해 실행이 멈춘다(조용히 남지 않는다).
 */
export function removeTestCreator(): void {
  const { profileId, creatorId } = TEST_CREATOR;
  const guarded = (table: string, column: string, id: string) =>
    `if to_regclass('${table}') is not null then execute format('delete from %s where ${column} = %L', '${table}', '${id}'); end if;`;
  psql(
    [
      "begin;",
      "set local session_replication_role = replica;",
      `delete from pii.creator_address_events where creator_id = '${creatorId}';`,
      `do $$ begin ${CREATOR_REFS.map((t) => guarded(t, "creator_id", creatorId)).join(" ")} ${PROFILE_REFS.map(([t, c]) => guarded(t, c, profileId)).join(" ")} end $$;`,
      "set local session_replication_role = origin;",
      `delete from pii.creator_addresses where creator_id = '${creatorId}';`,
      `delete from public.creators where id = '${creatorId}';`,
      `delete from auth.users where id = '${profileId}';`,
      "commit;",
    ].join(" "),
  );
}
