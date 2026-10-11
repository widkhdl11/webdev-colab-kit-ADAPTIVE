-- 2026-10-11 받았어요 · 감사 답장 리뷰 반영 — 20261011000004_gift_reply.sql 을 고친다(이미 적용한 파일은 그대로 둔다).
-- 스펙: gift-reply INV-G6·G8, 다음 기능 together INV-F3(받은 답장 수).
--
-- 1) orders.delivered_at — 배송 수령(delivery = 'delivered')이 된 시각. 택배사 연결이 delivery 를 바꾸면 줄 지킴이가 지금 시각을 채운다
--    (같이 준 값이 있으면 그 값). 수령에서 벗어나면 비운다. 팬 화면의 받았어요 날짜를 채우는 데 쓴다(INV-G6).
--    이 칸이 생기기 전에 수령이 된 주문은 칸이 비어 있다 — 그 상자는 「받았어요」만 보이고 날짜는 없다.
-- 2) my_gift_replies(p_order_no, p_creator_id) — 크리에이터별로도 거른다(「함께한 시간」이 크리에이터마다 받은 답장 수를 센다).
--    둘 다 기본값 null 이라 주문번호만 주던 호출은 그대로 동작한다.
--    받았어요 날짜(INV-G6): 받았어요 기록이 있으면 그 날짜, 없고 배송 수령만 있으면 수령 날짜. 둘 다 한국 시간 날짜이고 시각은 나가지 않는다.
-- 3) set_gift_reply_consent — 「공개해도 괜찮아요」를 끄면 「닉네임도 보이기」도 끈다. 화면이 정하지 않고 DB 가 정해,
--    저장된 두 값을 돌려준다(화면은 돌아온 값을 그린다).
--
-- 다시 적용해도 결과가 같다(칸은 if not exists, 함수는 지우고 다시 또는 create or replace, 줄 지킴이는 지우고 다시).

-- ── 1) 배송 수령 시각 ──────────────────────────────────

alter table public.orders add column if not exists delivered_at timestamptz;

create or replace function public.orders_delivered_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.delivery is distinct from 'delivered' then
    new.delivered_at := null;
  elsif new.delivered_at is null then
    new.delivered_at := now();
  end if;
  return new;
end $$;

drop trigger if exists orders_delivered_at on public.orders;
create trigger orders_delivered_at before insert or update of delivery, delivered_at on public.orders
  for each row execute function public.orders_delivered_at();

-- ── 2) 보낸 팬 본인 읽기 — 크리에이터별 거르기 · 받았어요 날짜 ──────────────────────────────────

drop function if exists public.my_gift_replies(text);

-- 보낸 팬 본인: 출고된 상자마다 받았어요(INV-G6 — 받았어요 기록이나 배송 수령)·받았어요 날짜·지우지 않은 답장·공개 동의·공유 태그.
-- p_order_no 를 주면 그 주문만, p_creator_id 를 주면 그 크리에이터에게 보낸 것만. 탈퇴한 크리에이터는 이름·사진 칸을 비운다.
create or replace function public.my_gift_replies(p_order_no text default null, p_creator_id uuid default null)
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
         coalesce(public.receiving_today_at(r.received_at),
                  case when o.delivery = 'delivered' then public.receiving_today_at(o.delivered_at) end),
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
    and (p_creator_id is null or o.creator_id = p_creator_id)
  order by o.registered_at desc, o.order_no, b.seq;
$$;

revoke all on function public.my_gift_replies(text, uuid) from public, anon;
grant execute on function public.my_gift_replies(text, uuid) to authenticated;

-- ── 3) 공개 동의 — 공개를 끄면 닉네임 보이기도 끈다 ──────────────────────────────────

drop function if exists public.set_gift_reply_consent(uuid, boolean, boolean);

-- INV-G8: 공개 동의 — 그 선물을 보낸 사람 본인만. 지우지 않은 답장에만. 남의 상자·없는 상자는 P0002.
-- 닉네임 보이기는 공개했을 때만 켜진다(공개를 끄면 같이 꺼진다). 저장된 두 값을 돌려준다.
create or replace function public.set_gift_reply_consent(p_box_id uuid, p_public boolean, p_show_nickname boolean)
returns table (fan_public boolean, fan_show_nickname boolean)
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
  return query
  update public.gift_replies r
  set fan_public = p_public, fan_show_nickname = (p_public and p_show_nickname)
  where r.box_id = p_box_id
  returning r.fan_public, r.fan_show_nickname;
end $fn$;

revoke all on function public.set_gift_reply_consent(uuid, boolean, boolean) from public, anon;
grant execute on function public.set_gift_reply_consent(uuid, boolean, boolean) to authenticated;

notify pgrst, 'reload schema';
