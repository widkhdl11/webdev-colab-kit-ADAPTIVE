-- 2026-10-11 받았어요 · 감사 답장 · 답장 공유 카드 · 감사 답장 모음.
-- 스펙: gift-reply INV-G1~G10 (추가분 「팬·크리에이터 화면 기능」 F-5, 불변식 20·22, DECISIONS 2026-10-11).
--
-- 1) gift_replies — 상자당 한 줄(상자 ID 가 기본 키, INV-G2). 받았어요 시각 · 정해진 문구 코드 · 한 줄(0~80자) · 답장 시각 · 지운 시각 ·
--    팬의 공개 동의 두 칸. 상태는 셋뿐이다 — 확인만(문구 없음) · 답장함(문구 있음) · 지움(문구·한 줄을 비우고 지운 시각). 화면 쪽 API 로 읽기·쓰기 불가.
--    줄 지킴이: 답장은 고칠 수 없고(INV-G4), 지운 줄은 되살리지 않으며, 받았어요 시각·상자·주문은 바꾸지 않는다.
-- 2) creators 칸: reply_wall_visible(답장 모음 보이기, 기본 꺼짐) · x_handle(영문·숫자·밑줄 1~15자) · x_tag_allowed(태그 허용).
-- 3) 알림 종류 둘 — gift_reply(「답장이 왔어요」)·gift_received(「보낸 선물이 도착했다고 확인됐어요」). 상자마다라 사무실 상자 줄(parcel_id)을 가리킨다.
--    본문은 서버의 종류별 틀이 만든다 — 줄에는 본문·이름 칸이 없다(INV-G5, notifications INV-N1).
-- 4) 쓰기 함수 — 크리에이터 ID·팬 ID 를 인자로 받지 않고 로그인 토큰의 계정으로 정한다(INV-G1·G8):
--    confirm_gift_box(받았어요 + 선택 답장) · delete_gift_reply · set_gift_reply_consent(보낸 팬) · update_my_reply_settings(크리에이터).
--    오류 꼴: 42501 로그인 안 함·역할 아님 · P0002 내 상자가 아님(있는지도 알리지 않는다) · P0100 출고 전 · P0101 이미 답장함 ·
--    P0102 지운 답장(다시 쓰지 않음) · P0103 답장이 없음 · 22023 꼴 · P0081 금칙어 · P0082 연락처·주소 꼴(creator-tags INV-T7 필터)
-- 5) 읽기 함수 — my_received_boxes·my_gift_reply_pending·my_reply_settings(크리에이터 본인) · my_gift_replies·my_gift_reply_card(보낸 팬 본인) ·
--    creator_reply_wall(공개 — 양쪽 동의 + 받았어요 날짜(한국 시간) + 3일째 0시부터, 최신 20개, INV-G7).
--    날짜 칸은 date 로만 돌려준다 — 시각은 어느 읽기에도 나가지 않는다(INV-G6).
--
-- 다시 적용해도 결과가 같다(칸·표·색인은 if not exists, 제약은 지우고 다시, 함수는 create or replace).

-- ── 1) 답장 표 ──────────────────────────────────

create table if not exists public.gift_replies (
  box_id uuid primary key references public.boxes (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  received_at timestamptz not null default now(),
  phrase text check (phrase in ('thanks', 'love_it', 'will_use', 'cheered', 'touched')),
  line text check (char_length(line) between 1 and 80),
  replied_at timestamptz,
  deleted_at timestamptz,
  fan_public boolean not null default false,
  fan_show_nickname boolean not null default false,
  -- 한 줄은 문구가 있을 때만 · 문구는 답장했고 지우지 않았을 때만 · 지운 줄은 답장했던 줄
  constraint gift_replies_line_needs_phrase check (line is null or phrase is not null),
  constraint gift_replies_phrase_state check ((phrase is not null) = (replied_at is not null and deleted_at is null)),
  constraint gift_replies_deleted_was_reply check (deleted_at is null or replied_at is not null)
);
create index if not exists gift_replies_order_idx on public.gift_replies (order_id);
alter table public.gift_replies enable row level security;
revoke all on table public.gift_replies from public, anon, authenticated;

-- 답장은 고칠 수 없다(INV-G4) — 문구·한 줄·답장 시각은 한 번 정하면 지울 때(비우기)만 바뀐다. 지운 줄은 되살리지 않는다.
create or replace function public.gift_replies_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.box_id, new.order_id, new.received_at) is distinct from (old.box_id, old.order_id, old.received_at) then
    raise exception '받았어요 줄의 상자·주문·시각은 바꿀 수 없다' using errcode = '55000';
  end if;
  if old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then
    raise exception '지운 답장은 되살리지 않는다' using errcode = '55000';
  end if;
  if old.replied_at is not null and new.replied_at is distinct from old.replied_at then
    raise exception '답장 시각은 바꿀 수 없다' using errcode = '55000';
  end if;
  if old.phrase is not null and new.deleted_at is null and (new.phrase, new.line) is distinct from (old.phrase, old.line) then
    raise exception '답장은 고칠 수 없다' using errcode = '55000';
  end if;
  return new;
end $$;

drop trigger if exists gift_replies_guard on public.gift_replies;
create trigger gift_replies_guard before update on public.gift_replies for each row execute function public.gift_replies_guard();

-- ── 2) 크리에이터 칸 ──────────────────────────────────

alter table public.creators add column if not exists reply_wall_visible boolean not null default false;
alter table public.creators add column if not exists x_handle text;
alter table public.creators add column if not exists x_tag_allowed boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'creators_x_handle_shape') then
    alter table public.creators add constraint creators_x_handle_shape check (x_handle is null or x_handle ~ '^[A-Za-z0-9_]{1,15}$');
  end if;
end $$;

-- ── 3) 알림 종류 ──────────────────────────────────

alter table public.notification_outbox drop constraint if exists notification_outbox_kind_check;
alter table public.notification_outbox add constraint notification_outbox_kind_check check (kind = any (array[
  'approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived', 'hold_fan', 'box_missing',
  'gift_pending_box', 'difference_due', 'payment_canceled', 'difference_canceled', 'gift_reply', 'gift_received'
]));
alter table public.notification_kakao_templates drop constraint if exists notification_kakao_templates_kind_check;
alter table public.notification_kakao_templates add constraint notification_kakao_templates_kind_check check (kind = any (array[
  'approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived', 'hold_fan', 'box_missing',
  'gift_pending_box', 'difference_due', 'payment_canceled', 'difference_canceled', 'gift_reply', 'gift_received'
]));
-- 상자마다 가는 종류는 사무실 상자 줄을 가리킨다(멱등 키에 상자가 들어간다)
alter table public.notification_outbox drop constraint if exists notification_outbox_parcel_kind;
alter table public.notification_outbox add constraint notification_outbox_parcel_kind
  check ((kind = any (array['box_arrived', 'difference_due', 'gift_reply', 'gift_received'])) = (parcel_id is not null));

-- 받았어요·답장 알림 줄 — 이메일 줄은 늘, 승인된 카카오 템플릿이 있으면 카카오 줄도(INV-N7). 같은 이름의 줄이 있으면 그대로(INV-N4).
create or replace function public.gift_reply_enqueue(p_kind text, p_order_id uuid, p_parcel_id uuid, p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_outbox (kind, order_id, parcel_id, account_id, channel, event_at)
  select p_kind, p_order_id, p_parcel_id, p_account_id, ch.channel, now()
  from (values ('email'), ('kakao')) as ch (channel)
  where ch.channel = 'email'
     or exists (select 1 from public.notification_kakao_templates t where t.kind = p_kind)
  on conflict do nothing;
end $$;

revoke all on function public.gift_reply_enqueue(text, uuid, uuid, uuid) from public, anon, authenticated;

-- ── 4) 쓰기 함수 ──────────────────────────────────

-- 로그인한 크리에이터가 받은 상자인가 — 그 상자의 주문 한 줄. 아니면(없는 상자 포함) P0002. 크리에이터 계정이 아니면 42501.
create or replace function public.gift_reply_my_order(p_box_id uuid)
returns public.orders
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'creator') then
    raise exception '크리에이터 계정만 한다' using errcode = '42501';
  end if;
  select o.* into v_order
  from public.boxes b
  join public.orders o on o.id = b.order_id
  join public.creators c on c.id = o.creator_id
  where b.id = p_box_id and c.profile_id = v_uid;
  if not found then
    raise exception '내가 받은 상자가 아니다' using errcode = 'P0002';
  end if;
  return v_order;
end $$;

revoke all on function public.gift_reply_my_order(uuid) from public, anon, authenticated;

-- INV-G1·G2·G3·G5: 받았어요 — 문구가 없으면 확인만, 있으면 답장과 함께. 돌려주는 값: received(확인만 남김) · replied(답장 남김) · unchanged(이미 받았어요).
-- 상자당 한 줄(기본 키)이라 동시에 두 번 와도 한쪽만 줄을 만들고 알림을 넣는다. 확인만 한 상자에는 답장을 한 번 더할 수 있다.
create or replace function public.confirm_gift_box(p_box_id uuid, p_phrase text, p_line text)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_order public.orders;
  v_line text := nullif(public.app_trim(coalesce(p_line, '')), '');
  v_problem text;
  v_parcel_id uuid;
  v_row public.gift_replies;
  v_inserted boolean := false;
begin
  v_order := public.gift_reply_my_order(p_box_id);

  -- INV-G3: 문구는 다섯 코드 중 하나, 한 줄은 문구가 있을 때만 · 0~80자 · 줄바꿈·보이지 않는 글자 없음 · 업계 기본 필터
  if p_phrase is null and v_line is not null then
    raise exception '한 줄은 문구를 고른 답장에만 쓴다' using errcode = '22023';
  end if;
  if p_phrase is not null and p_phrase not in ('thanks', 'love_it', 'will_use', 'cheered', 'touched') then
    raise exception '답장 문구는 정해진 다섯 개 중 하나다' using errcode = '22023';
  end if;
  if v_line is not null then
    if char_length(v_line) > 80 then
      raise exception '한 줄은 80자까지다' using errcode = '22023';
    end if;
    if v_line ~ '[\u0001-\u001f\u007f-\u009f\u00ad\u061c\u115f\u1160\u180e\u200b-\u200f\u202a-\u202e\u2028\u2029\u2060-\u2064\u2066-\u206f\u3164\ufeff\uffa0\ufff9-\ufffb]' then
      raise exception '한 줄에 줄바꿈·보이지 않는 글자는 쓸 수 없다' using errcode = '22023';
    end if;
    v_problem := public.creator_tag_text_problem(v_line);
    if v_problem = 'banned' then
      raise exception '한 줄에 쓸 수 없는 말이 들어 있다' using errcode = 'P0081';
    elsif v_problem = 'contact' then
      raise exception '한 줄에 전화번호·이메일·인터넷 주소는 쓸 수 없다' using errcode = 'P0082';
    end if;
    -- 기호만인 한 줄(「♥♥」 등)은 받는다 — 답장의 한 줄은 이름이 아니라 짧은 말이라 태그의 「기호만」 거부를 쓰지 않는다
  end if;

  -- INV-G1: 출고된 상자만(출고·배송중·수령 — 사무실 상자 줄은 출고 상태로 남는다)
  select p.id into v_parcel_id from public.office_parcels p where p.box_id = p_box_id and p.state = 'shipped';
  if v_parcel_id is null then
    raise exception '아직 출고되지 않은 상자다' using errcode = 'P0100';
  end if;

  insert into public.gift_replies (box_id, order_id, phrase, line, replied_at)
  values (p_box_id, v_order.id, p_phrase, case when p_phrase is null then null else v_line end, case when p_phrase is null then null else now() end)
  on conflict (box_id) do nothing
  returning true into v_inserted;

  if v_inserted then
    perform public.gift_reply_enqueue(case when p_phrase is null then 'gift_received' else 'gift_reply' end, v_order.id, v_parcel_id, v_order.fan_id);
    return case when p_phrase is null then 'received' else 'replied' end;
  end if;

  -- 이미 받았어요 줄이 있다 — 줄을 잠그고 지금 상태를 본다(동시에 온 다른 요청이 끝난 뒤의 상태)
  select * into v_row from public.gift_replies r where r.box_id = p_box_id for update;
  if p_phrase is null then
    return 'unchanged';
  end if;
  if v_row.deleted_at is not null then
    raise exception '지운 답장은 다시 쓰지 않는다' using errcode = 'P0102';
  end if;
  if v_row.phrase is not null then
    raise exception '이미 답장한 상자다' using errcode = 'P0101';
  end if;
  update public.gift_replies r set phrase = p_phrase, line = v_line, replied_at = now() where r.box_id = p_box_id;
  perform public.gift_reply_enqueue('gift_reply', v_order.id, v_parcel_id, v_order.fan_id);
  return 'replied';
end $fn$;

revoke all on function public.confirm_gift_box(uuid, text, text) from public, anon;
grant execute on function public.confirm_gift_box(uuid, text, text) to authenticated;

-- INV-G4: 답장 지우기 — 문구·한 줄을 비우고 팬의 공개 동의도 끈다. 받았어요 기록은 남는다. 이미 지웠으면 그대로.
create or replace function public.delete_gift_reply(p_box_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_row public.gift_replies;
begin
  perform public.gift_reply_my_order(p_box_id);
  select * into v_row from public.gift_replies r where r.box_id = p_box_id for update;
  if not found or v_row.replied_at is null then
    raise exception '지울 답장이 없다' using errcode = 'P0103';
  end if;
  if v_row.deleted_at is not null then
    return;
  end if;
  update public.gift_replies r
  set phrase = null, line = null, deleted_at = now(), fan_public = false, fan_show_nickname = false
  where r.box_id = p_box_id;
end $fn$;

revoke all on function public.delete_gift_reply(uuid) from public, anon;
grant execute on function public.delete_gift_reply(uuid) to authenticated;

-- INV-G8: 공개 동의 — 그 선물을 보낸 사람 본인만. 지우지 않은 답장에만. 남의 상자·없는 상자는 P0002.
create or replace function public.set_gift_reply_consent(p_box_id uuid, p_public boolean, p_show_nickname boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_row public.gift_replies;
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  if p_public is null or p_show_nickname is null then
    raise exception '공개 동의는 참·거짓이다' using errcode = '22023';
  end if;
  select r.* into v_row
  from public.gift_replies r
  join public.orders o on o.id = r.order_id
  where r.box_id = p_box_id and o.fan_id = v_uid
  for update of r;
  if not found then
    raise exception '내가 보낸 상자의 답장이 아니다' using errcode = 'P0002';
  end if;
  if v_row.phrase is null then
    raise exception '공개할 답장이 없다' using errcode = 'P0103';
  end if;
  update public.gift_replies r set fan_public = p_public, fan_show_nickname = p_show_nickname where r.box_id = p_box_id;
end $fn$;

revoke all on function public.set_gift_reply_consent(uuid, boolean, boolean) from public, anon;
grant execute on function public.set_gift_reply_consent(uuid, boolean, boolean) to authenticated;

-- INV-G8: 답장 모음 보이기 · X 계정 · 태그 허용 — 로그인한 크리에이터 본인만. X 계정은 영문·숫자·밑줄 1~15자, 비우면 지우고 태그 허용도 끈다.
create or replace function public.update_my_reply_settings(p_wall_visible boolean, p_x_handle text, p_x_tag_allowed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_handle text := nullif(public.app_trim(coalesce(p_x_handle, '')), '');
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'creator') then
    raise exception '크리에이터 계정만 고친다' using errcode = '42501';
  end if;
  if p_wall_visible is null or p_x_tag_allowed is null then
    raise exception '켜고 끄는 칸은 참·거짓이다' using errcode = '22023';
  end if;
  if v_handle is not null and v_handle !~ '^[A-Za-z0-9_]{1,15}$' then
    raise exception 'X 계정은 영문·숫자·밑줄 1~15자다' using errcode = '22023';
  end if;
  update public.creators c
  set reply_wall_visible = p_wall_visible, x_handle = v_handle, x_tag_allowed = (v_handle is not null and p_x_tag_allowed)
  where c.profile_id = v_uid;
  if not found then
    raise exception '크리에이터 줄이 없다' using errcode = 'P0002';
  end if;
end $fn$;

revoke all on function public.update_my_reply_settings(boolean, text, boolean) from public, anon;
grant execute on function public.update_my_reply_settings(boolean, text, boolean) to authenticated;

-- ── 5) 읽기 함수 ──────────────────────────────────

-- 크리에이터 본인: 출고된 상자마다 보낸 사람 닉네임·품목·출고 날짜·받았어요·답장 상태. 최근 출고 순, 200개까지.
create or replace function public.my_received_boxes()
returns table (box_id uuid, order_no text, box_seq integer, box_count integer, sender_nickname text, item_category text, item_kind text,
               shipped_on date, received_on date, reply_state text, phrase text, line text, replied_on date)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, o.order_no, b.seq::integer,
         (select count(*)::integer from public.boxes x where x.order_id = o.id),
         f.nickname, o.item_category, o.item_kind,
         public.receiving_today_at(p.shipped_at),
         public.receiving_today_at(r.received_at),
         case when r.box_id is null then 'none'
              when r.deleted_at is not null then 'deleted'
              when r.phrase is not null then 'replied'
              else 'confirmed' end,
         r.phrase, r.line,
         case when r.deleted_at is null then public.receiving_today_at(r.replied_at) end
  from public.office_parcels p
  join public.boxes b on b.id = p.box_id
  join public.orders o on o.id = b.order_id
  join public.creators c on c.id = o.creator_id
  join public.profiles me on me.id = c.profile_id and me.role = 'creator'
  join public.profiles f on f.id = o.fan_id
  left join public.gift_replies r on r.box_id = b.id
  where c.profile_id = auth.uid() and p.state = 'shipped'
  order by p.shipped_at desc, o.order_no, b.seq
  limit 200;
$$;

revoke all on function public.my_received_boxes() from public, anon;
grant execute on function public.my_received_boxes() to authenticated;

-- INV-G10: 아직 답장 안 한 선물 수 — 출고된 상자 가운데 답장이 없고(받았어요 줄이 없거나 확인만) 지우지도 않은 것. 본인 것만, 크리에이터가 아니면 0.
create or replace function public.my_gift_reply_pending()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.office_parcels p
  join public.boxes b on b.id = p.box_id
  join public.orders o on o.id = b.order_id
  join public.creators c on c.id = o.creator_id
  join public.profiles me on me.id = c.profile_id and me.role = 'creator'
  left join public.gift_replies r on r.box_id = b.id
  where c.profile_id = auth.uid() and p.state = 'shipped'
    and (r.box_id is null or (r.replied_at is null and r.deleted_at is null));
$$;

revoke all on function public.my_gift_reply_pending() from public, anon;
grant execute on function public.my_gift_reply_pending() to authenticated;

-- 크리에이터 본인 답장 설정
create or replace function public.my_reply_settings()
returns table (wall_visible boolean, x_handle text, x_tag_allowed boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.reply_wall_visible, c.x_handle, c.x_tag_allowed
  from public.creators c
  join public.profiles me on me.id = c.profile_id and me.role = 'creator'
  where c.profile_id = auth.uid();
$$;

revoke all on function public.my_reply_settings() from public, anon;
grant execute on function public.my_reply_settings() to authenticated;

-- 보낸 팬 본인: 출고된 상자마다 받았어요(INV-G6 — 받았어요 기록이나 배송 수령)·받았어요 날짜·지우지 않은 답장·공개 동의·공유 태그.
-- p_order_no 를 주면 그 주문만. 탈퇴한 크리에이터는 이름·사진 칸을 비운다(화면이 「탈퇴한 크리에이터」·기본 이미지로 그린다).
create or replace function public.my_gift_replies(p_order_no text default null)
returns table (box_id uuid, order_no text, creator_id uuid, box_seq integer, box_count integer, received boolean, received_on date,
               creator_name text, creator_photo_path text, phrase text, line text, replied_on date,
               fan_public boolean, fan_show_nickname boolean, x_tag text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, o.order_no, o.creator_id, b.seq::integer,
         (select count(*)::integer from public.boxes x where x.order_id = o.id),
         (r.box_id is not null or coalesce(o.delivery = 'delivered', false)),
         public.receiving_today_at(r.received_at),
         case when c.profile_id is not null then c.name end,
         case when c.profile_id is not null then c.photo_path end,
         r.phrase,
         r.line,
         case when r.phrase is not null then public.receiving_today_at(r.replied_at) end,
         coalesce(r.fan_public, false),
         coalesce(r.fan_show_nickname, false),
         case when c.profile_id is not null and c.x_tag_allowed and c.x_handle is not null then c.x_handle end
  from public.orders o
  join public.boxes b on b.order_id = o.id
  join public.office_parcels p on p.box_id = b.id and p.state = 'shipped'
  join public.creators c on c.id = o.creator_id
  left join public.gift_replies r on r.box_id = b.id
  where o.fan_id = auth.uid()
    and (p_order_no is null or o.order_no = p_order_no)
  order by o.registered_at desc, o.order_no, b.seq;
$$;

revoke all on function public.my_gift_replies(text) from public, anon;
grant execute on function public.my_gift_replies(text) to authenticated;

-- INV-G9: 공유 카드 재료 — 그 선물을 보낸 사람 본인의 지우지 않은 답장 하나. 크리에이터 사진·공개 이름·문구·한 줄·날짜·본인 닉네임·태그(허용했을 때만)뿐.
create or replace function public.my_gift_reply_card(p_box_id uuid)
returns table (creator_name text, creator_photo_path text, phrase text, line text, replied_on date, fan_nickname text, x_tag text)
language sql
stable
security definer
set search_path = ''
as $$
  select case when c.profile_id is not null then c.name end,
         case when c.profile_id is not null then c.photo_path end,
         r.phrase, r.line,
         public.receiving_today_at(r.replied_at),
         f.nickname,
         case when c.profile_id is not null and c.x_tag_allowed and c.x_handle is not null then c.x_handle end
  from public.gift_replies r
  join public.orders o on o.id = r.order_id
  join public.creators c on c.id = o.creator_id
  join public.profiles f on f.id = o.fan_id
  where r.box_id = p_box_id and o.fan_id = auth.uid() and r.phrase is not null;
$$;

revoke all on function public.my_gift_reply_card(uuid) from public, anon;
grant execute on function public.my_gift_reply_card(uuid) to authenticated;

-- INV-G7: 감사 답장 모음(공개) — ① 팬이 공개 동의 ② 크리에이터가 모음 보이기 ③ 받았어요 날짜(한국 시간) + 3일째 0시부터.
-- 본인 확인된(공개 화면이 열리는) 크리에이터만. 칸은 문구·한 줄·답장 날짜·팬 닉네임(팬이 보이기를 골랐을 때만, 아니면 비움)뿐. 최신 20개.
create or replace function public.creator_reply_wall(p_creator_id uuid)
returns table (phrase text, line text, replied_on date, fan_nickname text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.phrase, r.line,
         public.receiving_today_at(r.replied_at),
         case when r.fan_show_nickname then f.nickname end
  from public.gift_replies r
  join public.orders o on o.id = r.order_id
  join public.creators c on c.id = o.creator_id
  join public.profiles f on f.id = o.fan_id
  where o.creator_id = p_creator_id
    and c.identity_verified and c.profile_id is not null
    and c.reply_wall_visible
    and r.fan_public
    and r.phrase is not null
    and public.receiving_today_at(r.received_at) + 3 <= public.receiving_today()
  order by r.replied_at desc, r.box_id
  limit 20;
$$;

revoke all on function public.creator_reply_wall(uuid) from public;
grant execute on function public.creator_reply_wall(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
