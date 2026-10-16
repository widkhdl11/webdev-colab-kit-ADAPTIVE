-- 받는 주소 없이 보낸 상자 알림을 크리에이터에게도 (notifications INV-N21 · inbound-address-code INV-C12 ① — 2026-10-16 카드 d96 ③).
-- 6자리 없이 온 상자가 입고 때 어느 계정의 닉네임과 맞고, 그 계정에 결제가 끝났고 입고 전인 팬 선물 주문이 있으면 지금처럼 그 주문을 가리키는 줄(팬 쪽 링크),
-- 주문은 없고 그 계정이 보낸 결제 끝·입고 전·닫히지 않은 역조공 몫이 있으면 그 몫을 가리키는 줄(크리에이터 쪽 링크 — 보낸 역조공 화면의 「내 상자 찾기」).
-- 둘 다 있으면 팬 선물 쪽 하나만. 상자마다 한 번 — 이미 그 보류 상자의 줄이 있으면 넣지 않는다(다시 찍어도 대상이 바뀌어 두 줄이 되지 않게).
-- 몫 후보 판정은 찾기와 같은 revgift_share_before_inbound(20261016000008).
--
-- 1) 알림 줄 제약: 「받는 주소 없이 보낸 상자」(box_no_code) 줄은 주문이나 몫 둘 중 하나를 가리킨다. 몫을 가리킬 수 있는 종류는 역조공 받기·이 종류 둘.
-- 2) notification_enqueue_box_no_code — 20261016000007 과 같고, 주문이 없으면 몫으로.
-- 꺼내기(notification_claim)는 고치지 않는다 — 20261016000008 판이 몫 줄의 주문번호(몫 번호)를 이미 돌려준다. 본문 틀이 RG- 번호면 보낸 역조공 화면으로 잇는다.
-- 운영 적용 순서: 20261016000009 다음. 다시 적용해도 결과가 같다(제약은 drop if exists 뒤 add, 함수는 create or replace).

alter table public.notification_outbox drop constraint if exists notification_outbox_share_kind;
alter table public.notification_outbox add constraint notification_outbox_share_kind
  check ((kind <> 'revgift_offer' or share_id is not null) and (share_id is null or kind in ('revgift_offer', 'box_no_code')));
alter table public.notification_outbox drop constraint if exists notification_outbox_order_kind;
alter table public.notification_outbox add constraint notification_outbox_order_kind
  check (order_id is not null or kind in ('box_arrived', 'revgift_offer', 'box_no_code'));
alter table public.notification_outbox drop constraint if exists notification_outbox_box_no_code_target;
alter table public.notification_outbox add constraint notification_outbox_box_no_code_target
  check (kind <> 'box_no_code' or num_nonnulls(order_id, share_id) = 1);

create or replace function public.notification_enqueue_box_no_code(p_unmatched_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_account uuid;
  v_order_id uuid;
  v_share_id uuid;
  v_count integer;
begin
  select u.nickname_profile_id into v_account from public.office_unmatched u where u.id = p_unmatched_id;
  if v_account is null then
    return 0;
  end if;
  -- 상자마다 한 번 — 이 보류 상자의 줄이 이미 있으면 대상이 바뀌었어도 다시 넣지 않는다
  if exists (select 1 from public.notification_outbox n where n.kind = 'box_no_code' and n.unmatched_id = p_unmatched_id) then
    return 0;
  end if;
  -- 팬 선물 주문이 먼저(둘 다 있으면 팬 쪽 하나만 — INV-N21)
  select o.id into v_order_id
  from public.orders o
  where o.fan_id = v_account
    and exists (select 1 from public.boxes b where b.order_id = o.id and public.fan_box_before_inbound(b.id, v_account))
  order by o.registered_at, o.id
  limit 1;
  if v_order_id is null then
    -- 그 계정이 보낸 결제 끝·입고 전·닫히지 않은 역조공 몫(크리에이터의 찾기 후보와 같은 판정, INV-C4 ②-나)
    select s.id into v_share_id
    from public.revgift_sends d
    join public.revgift_shares s on s.send_id = d.id
    where d.sender_id = v_account and d.status = 'done' and public.revgift_share_before_inbound(s.id, v_account)
    order by d.settled_at, s.seq, s.id
    limit 1;
    if v_share_id is null then
      return 0;
    end if;
  end if;
  insert into public.notification_outbox (kind, order_id, share_id, unmatched_id, round, account_id, channel, event_at)
  select 'box_no_code', v_order_id, v_share_id, p_unmatched_id, 1, v_account, ch.channel, now()
  from (values ('email'), ('kakao')) as ch (channel)
  where ch.channel = 'email'
     or exists (select 1 from public.notification_kakao_templates t where t.kind = 'box_no_code')
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.notification_enqueue_box_no_code(uuid) from public, anon, authenticated, service_role;
