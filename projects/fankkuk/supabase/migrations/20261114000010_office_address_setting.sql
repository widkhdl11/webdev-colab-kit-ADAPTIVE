-- 팬꾹 주소(팬이 상자를 보내는 사무실 주소)를 코드 상수에서 DB 설정 한 줄로 (admin-console INV-K19).
-- 대표만 바꾸고(①②), 바꿀 때마다 고칠 수 없는 기록이 남고(③), 6자리를 받은 사람과 운영자만 읽는다(⑤).
-- 첫 값은 2026-11-14 코드 상수(src/entities/order/config/office-address.ts)에 있던 값이다. 다시 돌려도 이미 있는 값을 덮지 않는다.

create table if not exists public.office_address_setting (
  id boolean primary key default true check (id),
  address text not null,
  updated_at timestamptz not null default now()
);
alter table public.office_address_setting enable row level security;
-- 앱 서버 관리자 키(service_role)도 표를 직접 못 고친다 — 바꾸는 길은 아래 대표 판정 함수 하나(기록이 남는 길)뿐이다
revoke all on public.office_address_setting from public, anon, authenticated, service_role;

insert into public.office_address_setting (id, address)
values (true, '서울특별시 강남구 선릉로91길 8, 4층 팬꾹 검수센터')
on conflict (id) do nothing;

-- INV-K19 ③: 바꿀 때마다 한 줄. 고치거나 지울 수 없다(INV-K5 와 같다).
create table if not exists public.office_address_changes (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  changed_by uuid not null references public.profiles (id),
  before_address text not null,
  after_address text not null
);
alter table public.office_address_changes enable row level security;
revoke all on public.office_address_changes from public, anon, authenticated, service_role;

create or replace function public.office_address_changes_append_only()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception '주소 변경 기록은 고치거나 지울 수 없다' using errcode = '42501';
end $$;

drop trigger if exists office_address_changes_no_update on public.office_address_changes;
drop trigger if exists office_address_changes_no_delete on public.office_address_changes;
drop trigger if exists office_address_changes_no_truncate on public.office_address_changes;
create trigger office_address_changes_no_update before update on public.office_address_changes
  for each row execute function public.office_address_changes_append_only();
create trigger office_address_changes_no_delete before delete on public.office_address_changes
  for each row execute function public.office_address_changes_append_only();
-- 줄 단위 트리거는 TRUNCATE 에 돌지 않는다 — 표 전체 비우기도 따로 막는다(decrypt_log 등 다른 기록 표와 같다)
create trigger office_address_changes_no_truncate before truncate on public.office_address_changes
  for each statement execute function public.office_address_changes_append_only();

-- 앞뒤에서 자를 공백 — 앱의 JS trim() 과 같은 범위(일반 공백·탭류·NBSP·전각 공백 등). 앱이 먼저 잘라 보내지만, 함수를 직접 불러도 같게 자른다.
create or replace function public.office_address_trim(p text)
returns text
language sql immutable set search_path = ''
as $$
  select regexp_replace(p, '^[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+|[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+$', '', 'g');
$$;

-- INV-K19 ②: 앞뒤 공백을 뺀 5~120자, 줄바꿈·제어 문자 없음. 앱(entities/order/model/office-address.ts)도 같은 검사를 먼저 한다.
-- 제어 문자 = C0·DEL·C1(U+0000~001F·007F~009F) + 눈에 안 보이는 줄 구분·방향 제어·폭 없는 문자(U+200B~200F·2028~202E·2060~2069·FEFF)
--   — 화면에 보이는 주소와 복사되는 주소가 달라지지 않게 한다.
create or replace function public.office_address_wellformed(p text)
returns boolean
language sql immutable set search_path = ''
as $$
  select p is not null and char_length(p) between 5 and 120 and p = public.office_address_trim(p)
     and p !~ '[\u0001-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]';
$$;

-- ── 읽기 ─────────────────────────────────────────────────

-- INV-K19 ⑤: 운영자, 또는 6자리를 하나라도 받은 사람(inbound-address-code INV-C2 의 주인)만. 그 밖에는 null.
--   팬 선물 상자(boxes → orders.fan_id) · 역조공 몫(revgift_shares → revgift_sends.sender_id) · 선물함(revgift_boxes.owner_id)
create or replace function public.office_address()
returns text
language sql stable security definer set search_path = ''
as $$
  select s.address from public.office_address_setting s
  where auth.uid() is not null and (
    public.is_operator()
    or exists (select 1 from public.inbound_codes c join public.boxes b on b.id = c.box_id join public.orders o on o.id = b.order_id
               where o.fan_id = auth.uid())
    or exists (select 1 from public.inbound_codes c join public.revgift_shares sh on sh.id = c.share_id join public.revgift_sends sd on sd.id = sh.send_id
               where sd.sender_id = auth.uid())
    or exists (select 1 from public.revgift_boxes rb where rb.owner_id = auth.uid() and rb.inbound_code is not null)
  );
$$;

-- INV-K1: 관리자 읽기는 운영자만 — 아니면 null
create or replace function public.admin_office_address()
returns text
language sql stable security definer set search_path = ''
as $$
  select s.address from public.office_address_setting s where public.is_operator();
$$;

-- INV-K19 ③ · INV-K8: 바꾼 사람은 닉네임으로만, 최근 20줄
create or replace function public.admin_office_address_changes()
returns table (at timestamptz, changed_by_nickname text, before_address text, after_address text)
language sql stable security definer set search_path = ''
as $$
  select c.at, p.nickname, c.before_address, c.after_address
  from public.office_address_changes c join public.profiles p on p.id = c.changed_by
  where public.is_operator()
  order by c.at desc, c.id desc
  limit 20;
$$;

-- ── 쓰기 ─────────────────────────────────────────────────

-- INV-K19 ①②③: 대표만, 앞뒤 공백은 빼고 검사, 같은 값이면 아무것도 안 함, 바뀌면 기록 한 줄.
create or replace function public.admin_set_office_address(p_address text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_new text := public.office_address_trim(coalesce(p_address, ''));
  v_old text;
begin
  if not public.is_owner() then
    raise exception '팬꾹 주소는 대표만 바꾼다' using errcode = '42501';
  end if;
  if not public.office_address_wellformed(v_new) then
    raise exception '팬꾹 주소는 5~120자, 줄바꿈 없이' using errcode = '22023';
  end if;
  select s.address into v_old from public.office_address_setting s for update;
  if not found then
    raise exception '팬꾹 주소 설정 줄이 없다 — 마이그레이션의 첫 값 넣기를 확인' using errcode = 'P0002';
  end if;
  if v_old = v_new then
    return;
  end if;
  update public.office_address_setting set address = v_new, updated_at = now() where id;
  insert into public.office_address_changes (changed_by, before_address, after_address) values (auth.uid(), v_old, v_new);
end $$;

revoke all on function public.office_address() from public, anon;
revoke all on function public.admin_office_address() from public, anon;
revoke all on function public.admin_office_address_changes() from public, anon;
revoke all on function public.admin_set_office_address(text) from public, anon;
revoke all on function public.office_address_wellformed(text) from public, anon, authenticated;
revoke all on function public.office_address_trim(text) from public, anon, authenticated;
grant execute on function public.office_address() to authenticated;
grant execute on function public.admin_office_address() to authenticated;
grant execute on function public.admin_office_address_changes() to authenticated;
grant execute on function public.admin_set_office_address(text) to authenticated;
