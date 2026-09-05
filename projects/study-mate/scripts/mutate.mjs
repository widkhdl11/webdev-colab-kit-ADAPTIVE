// 변이 검증 도구 — 강제 장치를 하나 무력화하고, 그것을 붙들어야 할 테스트가
// 실제로 빨간불이 되는지 본다. 통과하는 테스트는 그것만으로 검증의 증거가 아니다.
//
// 사용: node scripts/mutate.mjs <변이이름>       변이를 심는다
//       node scripts/mutate.mjs --restore        원래대로 되돌린다(마이그레이션 재적용)
//       node scripts/mutate.mjs --list           변이 목록
//
// 되돌리기는 `supabase db reset --local` 이 아니라 정책을 바꾸는 마이그레이션(0002 · 0004)을
// 순서대로 다시 적용하는 것으로 한다 — 전부 create or replace / grant 라서 그것만으로 원상 복구된다.

import { Client } from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** 변이 이름 → 무엇을 무력화하는가 + 그것을 붙들어야 할 테스트 */
const MUTATIONS = {
  "z8-participants-columns": {
    holds: "INV-Z8 (S7) — 호스트가 자기 참여 행의 user_id 를 남으로 바꿀 수 없다",
    sql: `grant update on public.participants to authenticated;`,
  },
  "z8-chatpart-columns": {
    holds: "INV-Z8 (S8) — 멤버가 chat_id 를 남의 방으로 바꿀 수 없다",
    sql: `grant update on public.chat_participants to authenticated;`,
  },
  "z8-posts-columns": {
    holds: "INV-Z9 — 이미 쓴 모집글을 남의 스터디로 옮길 수 없다",
    sql: `grant update on public.posts to authenticated;`,
  },
  "p8-no-leave": {
    holds: "INV-P8 — 강퇴·탈퇴하면 채팅 구성원에서 빠진다",
    sql: `
      create or replace function public.sync_study_chat() returns trigger
      language plpgsql security definer set search_path = '' as $fn$
      declare v_chat_id uuid;
      begin
        select id into v_chat_id from public.chats where study_id = new.study_id;
        if v_chat_id is null then return new; end if;
        if new.status = 'accepted' then
          insert into public.chat_participants (chat_id, user_id)
            values (v_chat_id, new.user_id) on conflict do nothing;
        end if;
        return new;
      end; $fn$;`,
  },
  "p8-join-when-pending": {
    holds: "INV-P8 — 대기 중인 신청자는 채팅방에 안 들어간다",
    sql: `
      create or replace function public.sync_study_chat() returns trigger
      language plpgsql security definer set search_path = '' as $fn$
      declare v_chat_id uuid;
      begin
        select id into v_chat_id from public.chats where study_id = new.study_id;
        if v_chat_id is null then return new; end if;
        insert into public.chat_participants (chat_id, user_id)
          values (v_chat_id, new.user_id) on conflict do nothing;
        return new;
      end; $fn$;`,
  },
  "p9-invoker-count": {
    holds: "INV-P9 — 파생값은 누가 묻든 같은 답을 준다",
    sql: `
      create or replace function public.study_accepted_count(p_study_id uuid) returns integer
      language sql stable set search_path = '' as $fn$
        select count(*)::integer from public.participants
         where study_id = p_study_id and status = 'accepted';
      $fn$;
      create or replace function public.study_is_recruiting(p_study_id uuid) returns boolean
      language sql stable set search_path = '' as $fn$
        select s.closed_at is null and s.deleted_at is null
           and public.study_accepted_count(s.id) < s.max_participants
          from public.studies s where s.id = p_study_id;
      $fn$;`,
  },
  "p9-drop-status-filter": {
    holds: "INV-P9 — 세는 것은 '수락된' 참여자다 (대기 중인 사람이 아니라)",
    sql: `
      create or replace function public.study_accepted_count(p_study_id uuid) returns integer
      language sql stable security definer set search_path = '' as $fn$
        select count(*)::integer from public.participants where study_id = p_study_id;
      $fn$;`,
  },
  "z9-any-study": {
    holds: "INV-Z9 (S10) — 호스트가 아닌 사람은 남의 스터디에 모집글을 못 붙인다",
    sql: `
      drop policy if exists posts_insert_author on public.posts;
      create policy posts_insert_author on public.posts for insert
        with check (author_id = (select auth.uid()));`,
  },
  "z10-accept-deleted": {
    holds: "INV-Z10 (S11) — 지워진 스터디의 신청은 수락되지 않는다",
    sql: `
      create or replace function public.enforce_study_capacity() returns trigger
      language plpgsql security definer set search_path = '' as $fn$
      declare v_max smallint; v_accepted integer; v_closed timestamptz;
      begin
        if new.status <> 'accepted' then return new; end if;
        select max_participants, closed_at into v_max, v_closed
          from public.studies where id = new.study_id for update;
        if v_closed is not null then
          raise exception '마감' using errcode = 'check_violation';
        end if;
        select count(*) into v_accepted from public.participants
         where study_id = new.study_id and status = 'accepted';
        if v_accepted > v_max then
          raise exception '정원 초과' using errcode = 'check_violation';
        end if;
        return new;
      end; $fn$;`,
  },
  "z10-posts-read-open": {
    holds: "INV-Z10 — 지워진 스터디의 모집글은 목록에 안 나온다",
    sql: `
      drop policy if exists posts_read on public.posts;
      create policy posts_read on public.posts for select using (true);`,
  },
  "z10-apply-deleted": {
    holds: "INV-Z10 — 지워진 스터디에는 새 신청이 안 들어간다",
    sql: `
      drop policy if exists participants_apply_self on public.participants;
      create policy participants_apply_self on public.participants for insert
        with check (user_id = (select auth.uid()) and status = 'pending');`,
  },
  "z11-members-hidden": {
    holds: "INV-Z11 (S12) — 수락된 멤버는 같은 스터디의 수락된 사람들을 본다",
    sql: `
      drop policy if exists participants_read on public.participants;
      create policy participants_read on public.participants for select
        using (user_id = (select auth.uid())
               or public.is_study_host(study_id, (select auth.uid())));`,
  },
  "z11-members-wide-open": {
    holds: "INV-Z11 (S13) — 관계 없는 사람에게는 하나도 안 보인다",
    sql: `
      drop policy if exists participants_read on public.participants;
      create policy participants_read on public.participants for select using (true);`,
  },
  "z11-pending-leaks": {
    holds: "INV-Z11 — 대기·거절 행은 멤버에게 새지 않는다",
    sql: `
      drop policy if exists participants_read on public.participants;
      create policy participants_read on public.participants for select
        using (user_id = (select auth.uid())
               or public.is_study_host(study_id, (select auth.uid()))
               or public.is_study_member(study_id, (select auth.uid())));`,
  },
};

async function run(sql) {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}

const arg = process.argv[2];

if (!arg || arg === "--list") {
  for (const [name, m] of Object.entries(MUTATIONS)) console.log(`${name.padEnd(26)} ${m.holds}`);
  process.exit(0);
}

if (arg === "--restore") {
  // 정책을 바꾸는 마이그레이션을 순서대로 다시 적용한다. 0002 만 돌리면 0004 가 넓힌
  // 참여자 조회 정책이 되돌아오지 않아 다음 변이의 판정이 틀어진다.
  for (const file of ["0002_review_fixes.sql", "0004_member_visibility.sql"]) {
    await run(readFileSync(join(HERE, "..", "supabase", "migrations", file), "utf-8"));
  }
  console.log("복구 완료 (0002 · 0004 재적용)");
  process.exit(0);
}

const mutation = MUTATIONS[arg];
if (!mutation) {
  console.error(`모르는 변이: ${arg}. --list 로 목록을 본다.`);
  process.exit(1);
}

await run(mutation.sql);
console.log(`변이 심음: ${arg}\n  이것을 붙들어야 할 검사: ${mutation.holds}`);
