-- 반송 주소 확인 · 처분 (규칙 바꾸기 넷 3차 묶음, DECISIONS 2026-10-17, 카드 d100·d101 「승인」) — public 쪽.
-- 스펙: office-workflow 정한 것 2 · INV-W1(반송 대기·처분 대상·처분 줄)·W8·W15, address-protection INV-P18, notifications INV-N22·N13·N6 표,
--       action-center INV-J1·J3·J5, payment INV-M8(처분돼도 환불을 다시 계산하지 않는다).
--
-- 개인정보 구역(pii)을 건드리는 것 — 등록 주소를 상자에 복사하는 확인 함수, 복사본을 내주는 봉투 함수, 반송 확정·처분 때 복사본을 지우는 트리거 — 은
-- supabase/manual/0020_return_address.sql(사람이 적용)에 있다. 이 파일은 pii 를 한 글자도 참조하지 않는다.
--
-- 1) 상자 칸 둘: return_waiting_at(반송 대기가 된 시각 — 14일 재알림·30일 처분을 여기서 센다), return_confirmed_at(보낸 사람이 반송 주소를 확인한 시각 —
--    manual/0020 의 확인 함수만 채운다). 칸 이름에 address 를 넣지 않는다(개인정보 노출 검사가 public 칸 이름을 본다).
--    반송 대기로 바뀌는 처리에서 시각을 적는 것은 트리거 하나다 — 반송 대기로 바꾸는 함수가 여럿이라 한 자리에 둔다.
-- 2) 반송 주소 알림(INV-N22): 주문에 이어진 상자가 반송 대기가 되는 처리가 끝날 때(커밋 직전, 지연 트리거) 그 주문을 보낸 사람에게 return_address.
--    팬 선물은 주문 단위로 한 번 — 같은 처리에서 같은 주문에 hold_fan 이 들어갔거나 이미 return_address 를 넣었으면 넣지 않는다(같은 처리 = 같은 now()).
--    역조공 몫 상자는 보낸 크리에이터에게(몫 하나에 상자 하나). 어느 주문에도 이어지지 않은 상자는 없다(S22b).
--    줄은 상자를 가리킨다(parcel_id) — 같은 주문의 다른 상자가 나중에 다른 처리에서 반송 대기가 되면 그때 또 한 줄이 간다.
-- 3) 자동 처리(office_run_expiry): ⑩-1 반송 대기 + 720시간 확인 전 → 처분 대상(dispose_due, 상자마다 잠근 뒤 다시 본다 — 확인과 겹쳐도 하나만),
--    ⑩-2 반송 대기 + 336시간 확인 전 → 보낸 사람에게 상자마다 한 번 return_address_reminder. 결과에 dispose_due · return_reminders 칸.
-- 4) 처분 기록(office_record_disposal): 운영자만, 처분 대상 상자만. 처분(disposed, 끝) + 처분 기록(office_disposals, 추가만) + 봉투 파쇄 기록.
--    환불은 다시 계산하지 않는다 — 주문의 검수 결과·상태를 바꾸지 않는다(처분은 반송 확정처럼 셈에서 빠지고 반송으로 센다).
-- 5) 반송 송장: 주문에 이어진 상자는 봉투 번호 길(office_print_return_label)로 출력하지 않는다 — 보낸 사람이 확인한 주소를 여는 반송 송장 출력 함수
--    (앱의 복호화 역할)만 출력 단계로 넘긴다(return_finish_print, 확인 전이면 P0041). 어느 주문에도 이어지지 않은 상자는 지금처럼 봉투 번호로(S15f).
--    열람 기록(return_decrypt_log)·돌려줌(return_decrypt_releases)·판정 재료(return_print_context)·돌려주기(return_release_print)는 역조공 몫과 같은 꼴이다.
-- 6) 보낸 사람의 열람 기록 읽기(my_return_access_log, INV-P18) — 그 사람이 보낸 상자의 연 줄과 복사본을 지운 줄(지운 기록 표 return_address_events —
--    manual/0020 의 트리거가 넣는다).
-- 7) 처리할 일: 팬 「반송 주소 확인」 카드(my_action_items, 상자마다), 크리에이터 보낸 선물 판의 반송 주소 줄(보낸 팬 선물 상자 · 보낸 역조공 몫).
--    조건은 확인 함수와 같다 — 반송 대기 · 확인 전 · 반송 대기 + 720시간 전.
-- 8) 상태 셈: 처분 대상은 반송 대기처럼(검수 완료 단계의 반송), 처분은 반송 확정처럼(셈 밖, 반송으로 센다). 차액 결제·크리에이터 읽기의 반송 목록에도 더한다.
--    다음 단계: 확인 전 반송 대기(주문에 이어진 상자) → wait_return_address, 처분 대상 → record_disposal.
-- 9) 알림 종류 둘(return_address · return_address_reminder) — 꼭 가는 알림, 상자를 가리킨다, 역조공 몫이면 주문 칸이 비어 있다.
--    꺼낼 때 재알림 줄의 상자가 이미 확인됐거나 반송 대기가 아니면 건너뛴다(return_not_waiting). 재알림 본문의 날짜(반송 대기 + 720시간)를 dispose_due_at 칸으로 내준다.
--
-- 운영 적용 순서: 20261017000003(상태 값) 다음, manual/0020 앞. 이 파일만 적용된 상태에서는 주문에 이어진 상자의 반송 송장이 나가지 않는다
-- (확인 함수가 없어 아무도 확인할 수 없다 — 30일 뒤 처분 대상이 된다). 그래서 manual/0020 을 바로 이어서 적용한다.
-- 다시 적용해도 결과가 같다(칸·표는 if not exists, 제약은 drop if exists 뒤 add, 함수는 create or replace 또는 drop if exists 뒤 create).

-- ── 1) 상자 칸 · 반송 대기 시각 ───────────────────────────────

alter table public.office_parcels add column if not exists return_waiting_at timestamptz;
alter table public.office_parcels add column if not exists return_confirmed_at timestamptz;
-- 이 마이그레이션 전에 반송 대기가 된 상자는 시각이 없다 — 적용 시각부터 센다(다시 적용해도 이미 적힌 줄은 그대로)
update public.office_parcels set return_waiting_at = now() where state = 'return_waiting' and return_waiting_at is null;

-- 반송 대기로 바뀌는 처리에서 그 시각을 적는다(다른 단계에서 처음 들어올 때만 — 반송 대기 안에서 다른 칸을 바꿀 때는 그대로)
create or replace function public.office_parcels_return_waiting_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.state = 'return_waiting' and (tg_op = 'INSERT' or old.state is distinct from 'return_waiting') then
    new.return_waiting_at := now();
  end if;
  return new;
end $$;
drop trigger if exists office_parcels_return_waiting_at on public.office_parcels;
create trigger office_parcels_return_waiting_at before insert or update of state on public.office_parcels
  for each row execute function public.office_parcels_return_waiting_at();

-- ── 2) 알림 종류 둘 (notifications INV-N22) ───────────────────────

alter table public.notification_outbox drop constraint if exists notification_outbox_kind_check;
alter table public.notification_outbox add constraint notification_outbox_kind_check check (kind = any (array[
  'approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived', 'hold_fan', 'box_missing',
  'gift_pending_box', 'gift_undelivered', 'difference_due', 'payment_canceled', 'difference_canceled', 'gift_reply', 'gift_received',
  'creator_check', 'box_no_code', 'revgift_offer', 'return_address', 'return_address_reminder'
]));
alter table public.notification_kakao_templates drop constraint if exists notification_kakao_templates_kind_check;
alter table public.notification_kakao_templates add constraint notification_kakao_templates_kind_check check (kind = any (array[
  'approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived', 'hold_fan', 'box_missing',
  'gift_pending_box', 'gift_undelivered', 'difference_due', 'payment_canceled', 'difference_canceled', 'gift_reply', 'gift_received',
  'creator_check', 'box_no_code', 'revgift_offer', 'return_address', 'return_address_reminder'
]));
-- 반송 주소 두 종류는 상자를 가리킨다 — 재알림은 상자마다 한 번이 줄 이름(notification_outbox_once)으로 지켜진다.
-- 20261017000002 와 같이 NOT VALID(그 전의 상자 없는 hold 줄이 있어도 적용이 멈추지 않게 — 새 줄부터 지킨다)
alter table public.notification_outbox drop constraint if exists notification_outbox_parcel_kind;
alter table public.notification_outbox add constraint notification_outbox_parcel_kind
  check ((kind = any (array['box_arrived', 'difference_due', 'gift_reply', 'gift_received', 'creator_check', 'hold', 'return_address', 'return_address_reminder']))
         = (parcel_id is not null)) not valid;
-- 역조공 몫 상자의 반송 주소 알림은 주문 칸이 비어 있다(받는 사람은 보낸 크리에이터, 주문번호는 상자의 몫에서 꺼낸다)
alter table public.notification_outbox drop constraint if exists notification_outbox_order_kind;
alter table public.notification_outbox add constraint notification_outbox_order_kind
  check (order_id is not null or kind in ('box_arrived', 'revgift_offer', 'box_no_code', 'return_address', 'return_address_reminder'));

-- 20261016000008 과 같고, 반송 주소 두 종류를 더했다(INV-N6 표 — 끌 수 없음 14종)
create or replace function public.notification_kind_must_deliver(p_kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_kind = any (array[
    'approval_request', 'hold', 'creator_check', 'hold_fan', 'box_missing', 'gift_pending_box', 'gift_undelivered',
    'difference_due', 'payment_canceled', 'difference_canceled', 'box_no_code', 'revgift_offer',
    'return_address', 'return_address_reminder'
  ]), false);
$$;

-- 반송 대기가 된 상자 → 보낸 사람에게 반송 주소 알림(INV-N22). 처리가 끝날 때(지연 트리거) 돈다 — 같은 처리에서 hold_fan 이 나중에 들어가도 본다.
create or replace function public.office_return_waiting_notice()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
  v_order uuid;
  v_account uuid;
begin
  -- 처리가 끝나는 지금 다시 읽는다 — 같은 처리 안에서 이미 다른 단계로 넘어갔으면 알리지 않는다
  select * into v from public.office_parcels x where x.id = new.id;
  if v.id is null or v.state <> 'return_waiting' then
    return null;
  end if;
  if v.box_id is not null then
    select o.id, o.fan_id into v_order, v_account from public.boxes b join public.orders o on o.id = b.order_id where b.id = v.box_id;
    -- 주문 단위로 한 번: 같은 처리(같은 now())에서 같은 주문에 hold_fan(본문이 같은 말 — INV-N13)이나 return_address 가 이미 들어갔으면 넣지 않는다
    if exists (select 1 from public.notification_outbox n
               where n.order_id = v_order and n.kind in ('hold_fan', 'return_address') and n.created_at = now()) then
      return null;
    end if;
  elsif v.share_id is not null then
    select d.sender_id into v_account from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id where s.id = v.share_id;
  else
    -- 어느 주문에도 이어지지 않은 상자 — 확인할 사람이 없다(INV-W15 · S22b)
    return null;
  end if;
  if v_account is null then
    return null;
  end if;
  insert into public.notification_outbox (kind, order_id, parcel_id, round, account_id, channel, event_at)
  select 'return_address', v_order, v.id, 1, v_account, ch.channel, now()
  from (values ('email'), ('kakao')) as ch (channel)
  where ch.channel = 'email' or exists (select 1 from public.notification_kakao_templates t where t.kind = 'return_address')
  on conflict do nothing;
  return null;
end $$;
revoke all on function public.office_return_waiting_notice() from public, anon, authenticated, service_role;
drop trigger if exists office_parcels_return_notice on public.office_parcels;
create constraint trigger office_parcels_return_notice after update of state on public.office_parcels
  deferrable initially deferred
  for each row when (new.state = 'return_waiting' and old.state is distinct from 'return_waiting')
  execute function public.office_return_waiting_notice();

-- ── 3) 반송 주소를 확인할 사람·상자 (manual/0020 의 확인 함수가 쓴다) ─────────

-- 그 상자 주문을 보낸 계정 — 팬 선물은 주문의 보낸 계정(팬, 또는 팬 선물을 보낸 크리에이터 계정 — action-center INV-J3), 역조공 몫은 보낸 크리에이터.
-- 어느 주문에도 이어지지 않은 상자는 null.
create or replace function public.return_sender_of(p_parcel_id uuid)
returns uuid
language sql stable set search_path = ''
as $$
  select coalesce(
    (select o.fan_id from public.office_parcels x join public.boxes b on b.id = x.box_id join public.orders o on o.id = b.order_id where x.id = p_parcel_id),
    (select d.sender_id from public.office_parcels x join public.revgift_shares s on s.id = x.share_id join public.revgift_sends d on d.id = s.send_id where x.id = p_parcel_id)
  );
$$;

-- 로그인한 사람이 보낸 상자 하나 — 팬 선물은 주문번호 + 상자 순번, 역조공 몫은 주문번호(RG-, 순번은 비우거나 1). 남의 상자·없는 상자는 null(같은 답).
create or replace function public.return_parcel_for_sender(p_order_no text, p_box_seq integer)
returns uuid
language sql stable set search_path = ''
as $$
  select x.id
  from public.office_parcels x
  left join public.boxes b on b.id = x.box_id
  left join public.orders o on o.id = b.order_id
  left join public.revgift_shares s on s.id = x.share_id
  where auth.uid() is not null
    and ((o.order_no = p_order_no and b.seq = p_box_seq)
         or (s.order_no = p_order_no and coalesce(p_box_seq, 1) = 1))
    and public.return_sender_of(x.id) = auth.uid()
  limit 1;
$$;

revoke all on function public.return_sender_of(uuid) from public, anon, authenticated, service_role;
revoke all on function public.return_parcel_for_sender(text, integer) from public, anon, authenticated, service_role;

-- ── 4) 처분 기록 (INV-W15 · W8) ───────────────────────────────

create table if not exists public.office_disposals (
  parcel_id uuid primary key references public.office_parcels (id),
  disposed_by uuid not null references public.profiles (id),
  at timestamptz not null default now()
);
alter table public.office_disposals enable row level security;
revoke all on public.office_disposals from public, anon, authenticated;
create or replace trigger office_disposals_no_update before update on public.office_disposals
  for each row execute function public.append_only_log();
create or replace trigger office_disposals_no_delete before delete on public.office_disposals
  for each row execute function public.append_only_log();

-- 운영자만, 처분 대상 상자만. 결과 'disposed'. 오류: 42501 운영자 아님 · 22023 QR 꼴 · P0002 없는 상자 · 55000 처분 대상이 아님(이미 처분 포함)
-- 주문의 상태·검수 결과·환불은 건드리지 않는다(payment INV-M8 — 반송 택배비 칸은 이미 빠졌고 그 칸이 보관·처분 비용이 된다)
create or replace function public.office_record_disposal(p_qr text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
begin
  if not coalesce(public.is_operator(), false) then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  v := public.office_lock_qr(p_qr);
  if v.state <> 'dispose_due' then
    raise exception '처분 대상 상자가 아니다' using errcode = '55000';
  end if;
  update public.office_parcels set state = 'disposed' where id = v.id;
  insert into public.office_disposals (parcel_id, disposed_by) values (v.id, auth.uid());
  -- 원 송장 봉투는 처분 때 파쇄한다(INV-W8)
  insert into public.office_envelope_shreds (parcel_id, shredded_by) values (v.id, auth.uid());
  perform public.office_sync(v.id);
  return 'disposed';
end $$;
revoke all on function public.office_record_disposal(text) from public, anon;
grant execute on function public.office_record_disposal(text) to authenticated;

-- ── 5) 반송 송장 ───────────────────────────────────────────────

-- 20261005000007 과 같고, 주문에 이어진 상자는 받지 않는다 — 보낸 사람이 확인한 주소로 반송 송장 출력 함수만 출력한다(INV-W8·W15).
-- 어느 주문에도 이어지지 않은 상자만 봉투 번호(= QR 번호)로(S15f).
create or replace function public.office_print_return_label(p_qr text, p_waybill text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  perform public.office_check_waybill(p_waybill);
  v := public.office_lock_qr(p_qr);
  if v.state <> 'return_waiting' then
    raise exception '반송 대기 상자가 아니다' using errcode = '55000';
  end if;
  if v.box_id is not null or v.share_id is not null then
    raise exception '주문에 이어진 상자는 보낸 사람이 확인한 주소로 출력한다' using errcode = '55000';
  end if;
  update public.office_parcels set state = 'return_printed', return_printed_at = now(), return_waybill_no = p_waybill where id = v.id;
  perform public.office_sync(v.id);
  return v.qr_code;
end $$;

-- 반송 주소 열람 기록 — 역조공 몫(20261006000022)과 같은 꼴, 상자마다. 연 줄은 봉투를 내주는 함수(manual/0020)만 넣는다.
create table if not exists public.return_decrypt_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  parcel_id uuid not null references public.office_parcels (id),
  requester_id uuid not null,
  result text not null check (result in ('opened', 'denied')),
  print_no smallint check (print_no between 1 and 3),
  deny_reason text check (deny_reason in ('not_owner', 'no_valid_approval', 'order_not_printable', 'decrypt_limit_reached', 'address_mismatch')),
  check ((result = 'opened') = (print_no is not null and deny_reason is null)),
  check ((result = 'denied') = (deny_reason is not null and print_no is null))
);
create index if not exists return_decrypt_log_parcel_opened on public.return_decrypt_log (parcel_id) where result = 'opened';
alter table public.return_decrypt_log enable row level security;
revoke all on public.return_decrypt_log from public, anon, authenticated, service_role, address_decryptor;
grant select, insert on public.return_decrypt_log to address_decryptor;
drop policy if exists return_decrypt_log_append on public.return_decrypt_log;
create policy return_decrypt_log_append on public.return_decrypt_log for insert to address_decryptor with check (result = 'denied');
drop policy if exists return_decrypt_log_read on public.return_decrypt_log;
create policy return_decrypt_log_read on public.return_decrypt_log for select to address_decryptor using (true);

create table if not exists public.return_decrypt_releases (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  opened_log_id bigint not null unique references public.return_decrypt_log (id),
  parcel_id uuid not null references public.office_parcels (id),
  requester_id uuid not null
);
create index if not exists return_decrypt_releases_parcel on public.return_decrypt_releases (parcel_id);
alter table public.return_decrypt_releases enable row level security;
revoke all on public.return_decrypt_releases from public, anon, authenticated, service_role, address_decryptor;

-- 복사본을 지운 기록(INV-P18 「지운 사실은 남고 값은 없다」) — manual/0020 의 트리거가 반송 확정·처분 때 넣는다. 상자·사건·결과·시각뿐.
create table if not exists public.return_address_events (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid not null references public.office_parcels (id),
  event text not null check (event in ('deleted')),
  outcome text not null check (outcome in ('returned', 'disposed')),
  at timestamptz not null default now()
);
alter table public.return_address_events enable row level security;
revoke all on public.return_address_events from public, anon, authenticated, service_role;

create or replace trigger return_decrypt_log_no_update before update or delete on public.return_decrypt_log
  for each row execute function public.append_only_log();
create or replace trigger return_decrypt_releases_no_update before update or delete on public.return_decrypt_releases
  for each row execute function public.append_only_log();
create or replace trigger return_address_events_no_update before update or delete on public.return_address_events
  for each row execute function public.append_only_log();

-- 판정 재료 — 없는 QR 이면 null, 어느 주문에도 이어지지 않은 상자면 {kind: unlinked}. 주소·이름·전화는 없다.
create or replace function public.return_print_context(p_qr text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.office_parcels;
begin
  if p_qr is null or p_qr !~ '^Q-[0-9]{6}$' then
    raise exception 'QR 꼴이 아니다' using errcode = '22023';
  end if;
  select * into v from public.office_parcels where qr_code = p_qr;
  if v.id is null then
    return null;
  end if;
  if v.box_id is null and v.share_id is null then
    return jsonb_build_object('kind', 'unlinked');
  end if;
  return jsonb_build_object(
    'kind', 'linked',
    'parcel_id', v.id,
    'order_no', coalesce((select o.order_no from public.boxes b join public.orders o on o.id = b.order_id where b.id = v.box_id),
                         (select s.order_no from public.revgift_shares s where s.id = v.share_id)),
    'parcel_state', v.state,
    'confirmed', v.return_confirmed_at is not null,
    -- 이 상자에서 주소를 연 횟수 = 연 줄 − 돌려준 줄
    'decrypt_count', (select count(*) from public.return_decrypt_log l where l.parcel_id = v.id and l.result = 'opened')
                   - (select count(*) from public.return_decrypt_releases r where r.parcel_id = v.id)
  );
end $$;

-- 주소를 연 뒤(봉인 속 계정 대조까지 통과) 부른다. {waybill, first} — first = 이번에 반송 송장 출력 단계로 넘겼다.
-- 이미 출력했으면 송장번호 없이(null) 불러도 처음 번호를 돌려준다. 확인 여부는 잠근 뒤 다시 본다(확인 전이면 P0041).
create or replace function public.return_finish_print(p_qr text, p_waybill text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
begin
  v := public.office_lock_qr(p_qr);
  if v.box_id is null and v.share_id is null then
    raise exception '주문에 이어진 상자가 아니다' using errcode = '22023';
  end if;
  if v.state = 'return_printed' then
    return jsonb_build_object('waybill', v.return_waybill_no, 'first', false);
  end if;
  if v.state <> 'return_waiting' then
    raise exception '지금 단계에서 할 수 없다' using errcode = '55000';
  end if;
  if v.return_confirmed_at is null then
    raise exception '보낸 사람이 반송 주소를 확인하지 않았다' using errcode = 'P0041';
  end if;
  perform public.office_check_waybill(p_waybill);
  update public.office_parcels set state = 'return_printed', return_printed_at = now(), return_waybill_no = p_waybill where id = v.id;
  perform public.office_sync(v.id);
  return jsonb_build_object('waybill', p_waybill, 'first', true);
end $$;

-- 송장이 안 나온 연 줄을 돌려준다 — 역조공 몫(revgift_release_print)과 같은 조건: 돌려준 적 없음 · 그 상자의 마지막 연 줄 · 같은 요청자 ·
-- 아직 반송 대기(출력 단계로 넘어가지 않음) · 상자마다 2번까지. 결과 {result: released} | {result: denied, reason}.
create or replace function public.return_release_print(p_log_id bigint, p_requester uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_log public.return_decrypt_log;
  v_qr text;
  v public.office_parcels;
  v_reason text;
begin
  if p_log_id is null or p_requester is null then
    raise exception '돌려줄 줄과 요청자가 있어야 한다' using errcode = '22023';
  end if;
  select * into v_log from public.return_decrypt_log where id = p_log_id;
  if v_log.id is null or v_log.result <> 'opened' then
    return jsonb_build_object('result', 'denied', 'reason', 'not_opened');
  end if;
  select x.qr_code into v_qr from public.office_parcels x where x.id = v_log.parcel_id;
  v := public.office_lock_qr(v_qr);
  if exists (select 1 from public.return_decrypt_releases r where r.opened_log_id = v_log.id) then
    v_reason := 'already_released';
  elsif v_log.id <> (select max(l.id) from public.return_decrypt_log l where l.parcel_id = v.id and l.result = 'opened') then
    v_reason := 'not_latest';
  elsif v_log.requester_id <> p_requester then
    v_reason := 'not_requester';
  elsif v.state <> 'return_waiting' then
    v_reason := 'not_inspected';
  elsif (select count(*) from public.return_decrypt_releases r where r.parcel_id = v.id) >= 2 then
    v_reason := 'release_limit_reached';
  end if;
  if v_reason is not null then
    return jsonb_build_object('result', 'denied', 'reason', v_reason);
  end if;
  insert into public.return_decrypt_releases (opened_log_id, parcel_id, requester_id) values (v_log.id, v.id, p_requester);
  return jsonb_build_object('result', 'released');
end $$;

revoke all on function public.return_print_context(text) from public, anon, authenticated, service_role;
revoke all on function public.return_finish_print(text, text) from public, anon, authenticated, service_role;
revoke all on function public.return_release_print(bigint, uuid) from public, anon, authenticated, service_role;
grant execute on function public.return_print_context(text) to address_decryptor;
grant execute on function public.return_finish_print(text, text) to address_decryptor;
grant execute on function public.return_release_print(bigint, uuid) to address_decryptor;

-- ── 6) 보낸 사람의 반송 주소 열람 기록 (INV-P18) ─────────────────

-- 로그인한 사람이 보낸 주문(역조공이면 몫)의 상자들 — 연 줄(시각·몇 번째·돌려받았는지)과 복사본을 지운 줄(시각·까닭). 남의 주문이면 빈 결과.
create or replace function public.my_return_access_log(p_order_no text)
returns table (at timestamptz, kind text, box_seq integer, print_no smallint, outcome text, released boolean)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with mine as (
    select x.id, coalesce(b.seq, 1)::integer as seq
    from public.office_parcels x
    left join public.boxes b on b.id = x.box_id
    left join public.orders o on o.id = b.order_id
    left join public.revgift_shares s on s.id = x.share_id
    where auth.uid() is not null
      and (o.order_no = p_order_no or s.order_no = p_order_no)
      and public.return_sender_of(x.id) = auth.uid()
  ),
  rows_ as (
    select l.at, 'opened'::text as kind, mine.seq, l.print_no, null::text as outcome,
           exists (select 1 from public.return_decrypt_releases r where r.opened_log_id = l.id) as released, 0 as src, l.id as seq_no
    from public.return_decrypt_log l join mine on mine.id = l.parcel_id
    where l.result = 'opened'
    union all
    select e.at, 'deleted', mine.seq, null::smallint, e.outcome, false, 1, 0::bigint
    from public.return_address_events e join mine on mine.id = e.parcel_id
  )
  select r.at, r.kind, r.seq, r.print_no, r.outcome, r.released
  from rows_ r
  order by r.at desc, r.src desc, r.seq_no desc;
end $$;
revoke all on function public.my_return_access_log(text) from public, anon;
grant execute on function public.my_return_access_log(text) to authenticated;

-- ── 7) 다음 단계 ───────────────────────────────────────────────

-- 20261017000002 와 같고, 확인 전 반송 대기(주문에 이어진 상자) → wait_return_address, 처분 대상 → record_disposal 을 더했다(처분은 끝 — done)
create or replace function public.office_next_step(p_parcel office_parcels, p_kind text)
returns text
language sql
stable
set search_path to ''
as $function$
  select case
    when p_parcel.hold_reason is not null and p_parcel.state in ('inspected', 'label_printed') then 'on_hold'
    else case coalesce(p_parcel.state::text, 'no_waybill')
    when 'no_waybill' then 'wait_waybill'
    when 'awaiting' then 'scan_inbound'
    when 'received' then 'confirm_label'
    when 'labeled' then 'inspect'
    when 'inspected' then case when public.office_parcel_shippable(p_parcel) then 'print_label'
                               when public.office_parcel_dead(p_parcel) then 'wait_expiry'
                               when p_kind = 'gift' and exists (
                                 select 1 from public.boxes b join public.payments d on d.order_id = b.order_id
                                 where b.id = p_parcel.box_id and d.kind = 'difference' and d.status in ('pending', 'failed')
                                   and d.expired_at is null and d.created_at <= now() - interval '168 hours'
                               ) then 'wait_expiry'
                               when p_kind = 'gift' and exists (
                                 select 1 from public.boxes b join public.orders o on o.id = b.order_id
                                 where b.id = p_parcel.box_id and o.approved_at is not null
                                   and exists (select 1 from public.payments d
                                               where d.order_id = o.id and d.kind = 'difference' and d.status <> 'done')
                               ) then 'wait_difference'
                               when p_kind = 'gift' then 'wait_approval' else 'wait_accept' end
    when 'held' then 'held'
    when 'tracker_held' then 'tracker_held'
    when 'report_held' then 'report_held'
    -- 주문에 이어진 상자는 보낸 사람이 반송 주소를 확인해야 출력한다(INV-W15)
    when 'return_waiting' then case when (p_parcel.box_id is not null or p_parcel.share_id is not null) and p_parcel.return_confirmed_at is null
                                    then 'wait_return_address' else 'print_return' end
    when 'return_printed' then 'confirm_return'
    when 'label_printed' then 'confirm_shipment'
    when 'dispose_due' then 'record_disposal'
    else 'done'
    end
  end;
$function$;

-- ── 8) 상태 셈 · 차액 결제 · 크리에이터 읽기 (처분 대상 = 반송 대기, 처분 = 반송 확정) ──

-- 20261017000002 와 같고, 처분 대상을 반송 대기처럼(3, 반송), 처분을 반송 확정처럼(셈 밖, 반송으로 센다) 둔다(INV-W15 — 환불을 다시 계산하지 않는다)
CREATE OR REPLACE FUNCTION public.office_sync_order(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_min integer;
  v_now integer;
  v_returned boolean;
  v_old public.orders;
  v_new public.orders;
  v_old_idx integer;
  v_new_idx integer;
  v_creator_account uuid;
begin
  select * into v_old from public.orders o where o.id = p_order_id for update;

  -- 닫힌 상자(도착하지 않음, INV-W10)는 세지 않는다 — 그 상자를 기다리느라 남은 상자가 멈추지 않게.
  -- 크리에이터 확인 대기(held)는 「라벨 부착」(2)으로 센다 — 답이 나기 전에는 주문의 검수가 끝나지 않는다(2026-10-12 (2) D3 ②)
  -- 추적기 보관·신고 보관은 검수 반송과 같이 3, 경찰 인계는 반송 확정처럼 세지 않는다 — 셋 다 검수 결과는 「반송」(검수 불합격 줄, INV-W14)
  select coalesce(min(case p.state
           when 'received' then 1 when 'labeled' then 2
           when 'inspected' then 3 when 'return_waiting' then 3 when 'return_printed' then 3 when 'dispose_due' then 3
           when 'tracker_held' then 3 when 'report_held' then 3
           when 'label_printed' then 4 when 'shipped' then 5
           when 'held' then 2 when 'returned' then null when 'police_handed' then null when 'disposed' then null
           else 0 end) filter (where p.state is null or p.state not in ('returned', 'police_handed', 'disposed')), 3),
         bool_or(p.state in ('return_waiting', 'return_printed', 'returned', 'dispose_due', 'disposed', 'tracker_held', 'report_held', 'police_handed'))
    into v_min, v_returned
  from public.boxes b left join public.office_parcels p on p.box_id = b.id
  where b.order_id = p_order_id and b.missing_at is null;

  select array_position(array['registered', 'received', 'labeled', 'inspected', 'label_printed', 'shipped'], o.status::text) - 1
    into v_now
  from public.orders o where o.id = p_order_id;
  v_min := greatest(v_min, coalesce(v_now, 0));

  update public.orders o
  set received_at = (select min(p.received_at) from public.boxes b join public.office_parcels p on p.box_id = b.id where b.order_id = o.id)
  where o.id = p_order_id and o.received_at is null
    and exists (select 1 from public.boxes b join public.office_parcels p on p.box_id = b.id where b.order_id = o.id and p.received_at is not null);

  update public.orders o
  set status = (array['registered', 'received', 'labeled', 'inspected', 'label_printed', 'shipped'])[v_min + 1]::public.order_status,
      received_at = case when v_min >= 1 then coalesce(o.received_at, now()) else o.received_at end,
      inspected_at = case when v_min >= 3 then coalesce(o.inspected_at, now()) else o.inspected_at end,
      inspection_result = case when v_min >= 3 then (case when coalesce(v_returned, false) then 'returned' else 'passed' end)
                               else o.inspection_result end,
      shipped_at = case when v_min >= 5 then coalesce(o.shipped_at, now()) else o.shipped_at end
  where o.id = p_order_id
    and o.status in ('registered', 'received', 'labeled', 'inspected', 'label_printed', 'shipped');

  -- ── 알림 (notifications INV-N3·N4·N8) ──
  select * into v_new from public.orders o where o.id = p_order_id;
  if v_new.id is null then
    return;
  end if;

  -- 상자가 처음 입고됨 + 승인 요청이 아직 대기 → 승인 요청 2차(크리에이터)
  if v_old.received_at is null and v_new.received_at is not null then
    select c.profile_id into v_creator_account from public.creators c where c.id = v_new.creator_id;
    perform public.notification_enqueue('approval_request', v_new.id, r.id, 2::smallint, v_creator_account, now())
    from public.approval_requests r
    where r.order_id = v_new.id and r.status = 'waiting';
  end if;

  -- 주문 상태가 입고·검수·출고 단계를 넘음 → 팬. 상태는 줄지 않으므로 넘은 단계마다 한 번.
  v_old_idx := coalesce(array_position(array['registered', 'received', 'labeled', 'inspected', 'label_printed', 'shipped'], v_old.status::text) - 1, -1);
  v_new_idx := coalesce(array_position(array['registered', 'received', 'labeled', 'inspected', 'label_printed', 'shipped'], v_new.status::text) - 1, -1);
  if v_old_idx >= 0 and v_new_idx > v_old_idx then
    if v_old_idx < 1 and v_new_idx >= 1 then
      perform public.notification_enqueue('arrived', v_new.id, null, 1::smallint, v_new.fan_id, now());
    end if;
    if v_old_idx < 3 and v_new_idx >= 3 then
      perform public.notification_enqueue('inspected', v_new.id, null, 1::smallint, v_new.fan_id, now());
    end if;
    if v_old_idx < 5 and v_new_idx >= 5 then
      perform public.notification_enqueue('shipped', v_new.id, null, 1::smallint, v_new.fan_id, now());
    end if;
  end if;
end $function$;

-- 20261006000014 와 같고, 처분된 역조공 몫 상자도 몫을 닫는다(반송으로)
CREATE OR REPLACE FUNCTION public.office_sync(p_parcel_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v public.office_parcels;
  v_share public.revgift_shares;
begin
  select * into v from public.office_parcels where id = p_parcel_id;
  if v.box_id is not null then
    perform public.office_sync_order((select b.order_id from public.boxes b where b.id = v.box_id));
    return;
  end if;

  update public.revgift_shares s
  set received_at = coalesce(s.received_at, v.received_at),
      inspected_at = case when v.state in ('inspected', 'held', 'return_waiting', 'return_printed', 'returned', 'label_printed', 'shipped', 'dispose_due', 'disposed')
                          then coalesce(s.inspected_at, v.inspected_at) else s.inspected_at end,
      -- 취소로 이미 닫힌 몫: 몫 닫기를 다시 부르지 않으므로 반송 시각만 적는다(20261005000007 동작)
      returned_at = case when v.state = 'returned' and s.cancelled_at is not null
                         then coalesce(s.returned_at, v.returned_at) else s.returned_at end
  where s.id = v.share_id
  returning * into v_share;

  -- INV-R9: 출고 확정·반송 확정이 되는 그 처리 안에서 몫을 닫는다(주소 삭제 + 지운 기록)
  if v_share.id is not null and v_share.shipped_at is null and v_share.returned_at is null and v_share.cancelled_at is null then
    if v.state = 'shipped' then
      perform public.close_revgift_share(v_share.order_no, 'shipped');
    elsif v.state = 'returned' then
      perform public.close_revgift_share(v_share.order_no, 'returned');
    elsif v.state = 'disposed' then
      -- 처분된 몫 상자(INV-W15)도 몫이 끝난다 — 몫 닫기의 결과 값은 출고·반송·취소 셋뿐이라 반송으로 닫는다(받는 팬 주소 복사본을 지운다, INV-R9)
      perform public.close_revgift_share(v_share.order_no, 'returned');
    end if;
  end if;
end $function$;

-- 20261017000002 와 같고, 반송 상태 목록에 처분 대상·처분을 더했다
CREATE OR REPLACE FUNCTION public.prepare_difference_payment(p_box_id uuid)
 RETURNS TABLE(toss_order_id text, amount_krw integer, order_no text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_order public.orders;
  v_pay public.payments;
  v_state public.office_state;
begin
  select o.* into v_order from public.orders o join public.boxes b on b.order_id = o.id where b.id = p_box_id;
  if v_order.id is null or v_order.fan_id is distinct from auth.uid() then
    raise exception '차액을 찾을 수 없다' using errcode = 'P0002';
  end if;
  select p.* into v_pay from public.payments p where p.box_id = p_box_id and p.kind = 'difference' for update;
  if v_pay.id is null then
    raise exception '차액을 찾을 수 없다' using errcode = 'P0002';
  end if;
  if v_pay.status = 'done' then
    raise exception '이미 낸 차액이다' using errcode = 'P0023';
  end if;
  if v_pay.status = 'confirming' then
    raise exception '결제를 처리하고 있다' using errcode = 'P0024';
  end if;
  select x.state into v_state from public.office_parcels x where x.box_id = p_box_id;
  -- M13: 기한(요청 + 168시간)이 지났으면 7일 처리 전이라도 받지 않는다 — 사람 처리 쪽의 기한 확인(W6)
  if v_pay.expired_at is not null or now() >= v_pay.created_at + interval '168 hours'
     or v_order.status in ('rejected', 'expired', 'canceled')
     or v_state in ('return_waiting', 'return_printed', 'returned', 'dispose_due', 'disposed', 'label_printed', 'shipped', 'tracker_held', 'report_held', 'police_handed') then
    raise exception '차액을 낼 수 없는 상태다' using errcode = 'P0022';
  end if;
  if v_pay.status = 'failed' then
    update public.payments p
    set toss_order_id = 'diff_' || replace(gen_random_uuid()::text, '-', ''), status = 'pending', payment_key = null, settled_at = null
    where p.id = v_pay.id
    returning p.* into v_pay;
  end if;
  return query select v_pay.toss_order_id, v_pay.amount_krw, v_order.order_no;
end $function$;

-- 20261017000002 와 같고, 반송 상태 목록에 처분 대상·처분을 더했다
CREATE OR REPLACE FUNCTION public.claim_difference_payment(p_toss_order_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pay public.payments;
  v_state public.office_state;
begin
  select * into v_pay from public.payments p
  where p.toss_order_id = p_toss_order_id and p.kind = 'difference'
  for update;
  if v_pay.id is null or v_pay.status <> 'pending'
     or v_pay.expired_at is not null or now() >= v_pay.created_at + interval '168 hours' then
    return false;
  end if;
  if exists (select 1 from public.orders o where o.id = v_pay.order_id and o.status in ('rejected', 'expired', 'canceled')) then
    return false;
  end if;
  select x.state into v_state from public.office_parcels x where x.box_id = v_pay.box_id for share;
  if v_state in ('return_waiting', 'return_printed', 'returned', 'dispose_due', 'disposed', 'label_printed', 'shipped', 'tracker_held', 'report_held', 'police_handed') then
    return false;
  end if;
  update public.payments set status = 'confirming', confirming_at = now() where id = v_pay.id;
  return true;
end $function$;

-- 20261017000002 와 같고, 반송 상태 목록에 처분 대상·처분을 더했다
CREATE OR REPLACE FUNCTION public.my_incoming_gifts()
 RETURNS TABLE(order_no text, sender_nickname text, box_count integer, stage text, paid_at timestamp with time zone, received_at timestamp with time zone, inspected_at timestamp with time zone, shipped_at timestamp with time zone, inspection_result text, delivery text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with mine as (
    select o.*,
           -- 반송되지 않은 상자들의 가장 늦은 단계(주문 상태 계산과 같은 순서) — 0 입고 전 · 1 입고 · 3 검수 완료 · 5 출고
           (select min(case p.state
                         when 'received' then 1 when 'labeled' then 1 when 'held' then 1
                         when 'inspected' then 3 when 'label_printed' then 3
                         when 'shipped' then 5
                         else 0 end)
            from public.boxes b left join public.office_parcels p on p.box_id = b.id
            where b.order_id = o.id and b.missing_at is null
              and (p.state is null or p.state not in ('return_waiting', 'return_printed', 'returned', 'dispose_due', 'disposed', 'tracker_held', 'report_held', 'police_handed'))) as live_min,
           -- 남은 상자가 있고 그 전부가 반송(반송 대기 포함)·추적기 보관인가
           exists (select 1 from public.boxes b join public.office_parcels p on p.box_id = b.id
                   where b.order_id = o.id and b.missing_at is null
                     and p.state in ('return_waiting', 'return_printed', 'returned', 'dispose_due', 'disposed', 'tracker_held', 'report_held', 'police_handed'))
           and not exists (select 1 from public.boxes b left join public.office_parcels p on p.box_id = b.id
                           where b.order_id = o.id and b.missing_at is null
                             and (p.state is null or p.state not in ('return_waiting', 'return_printed', 'returned', 'dispose_due', 'disposed', 'tracker_held', 'report_held', 'police_handed'))) as all_returned,
           public.order_has_tracker_box(o.id) as any_tracker
    from public.orders o
    join public.creators c on c.id = o.creator_id
    join public.profiles me on me.id = c.profile_id
    where c.profile_id = auth.uid()
      and me.role = 'creator'
      and o.registered_at is not null
      and o.status <> 'pending_payment'
  ),
  staged as (
    select m.*,
           case
             when m.status in ('rejected', 'expired', 'canceled') then 'closed'
             when m.all_returned then 'returned'
             when m.delivery = 'delivered' then 'delivered'
             when m.delivery = 'in_transit' then 'in_transit'
             when m.live_min = 5 or m.status = 'shipped' then 'shipped'
             when m.live_min = 3 then 'inspected'
             when m.live_min = 1 then 'received'
             -- 남은 상자가 없으면(전부 닫힘) 주문 상태로
             when m.live_min is null and m.status in ('inspected', 'label_printed') then 'inspected'
             when m.live_min is null and m.status in ('received', 'labeled') then 'received'
             else 'paid'
           end as stage
    from mine m
  )
  select m.order_no,
         f.nickname,
         (select count(*)::integer from public.boxes b where b.order_id = m.id),
         m.stage,
         m.registered_at,
         m.received_at,
         m.inspected_at,
         m.shipped_at,
         case
           -- 위치 추적기 상자: 신고를 고르는 동안·신고 보관·경찰 인계 뒤에는 보관(INV-W9·W14), 반송 대기로 넘어가면 아래 반송
           when m.any_tracker then 'held'
           when m.all_returned or (m.live_min is null and m.inspection_result = 'returned') then 'returned'
           when m.stage in ('inspected', 'shipped', 'in_transit', 'delivered') then 'passed'
           else null
         end,
         m.delivery
  from staged m
  join public.profiles f on f.id = m.fan_id
  order by m.registered_at desc;
$function$;

-- ── 9) 자동 처리 ⑩ (INV-W15 · N22) ─────────────────────────────

-- 20261017000002 와 같고, ⑩ 단계(반송 주소 기한 — 처분 대상 · 14일 재알림)를 더했다. 결과에 dispose_due · return_reminders
CREATE OR REPLACE FUNCTION public.office_run_expiry(p_order_no text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_gifts integer;
  v_unmatched integer;
  v_differences integer;
  v_revgifts integer;
  v_pending_gifts integer;
  v_pending_revgifts integer;
  v_held integer;
  v_held_parcels integer := 0;
  v_parcel uuid;
  v_order uuid;
  v_boxes_missing integer := 0;
  v_box_missing_alerts integer;
  v_kept_closed integer := 0;
  v_box uuid;
  v_kept_shares integer;
  v_n integer;
  v_p public.office_parcels;
  v_k public.office_creator_checks;
  v_dispose_due integer := 0;
  v_return_reminders integer := 0;
begin
  if not (public.is_operator() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception '운영자만 돌린다' using errcode = '42501';
  end if;

  -- 0a) 24시간 지난 팬 선물 결제 대기(payment INV-M15)
  update public.payments p
  set status = 'failed', settled_at = now()
  where p.kind = 'initial' and p.status = 'pending'
    and p.created_at <= now() - interval '24 hours'
    and (p_order_no is null or p.order_id = (select o.id from public.orders o where o.order_no = p_order_no));
  get diagnostics v_pending_gifts = row_count;

  -- 0b) 24시간 지난 역조공 결제 대기(reverse-gift INV-R15)
  update public.revgift_sends d
  set status = 'failed'
  where d.status = 'pending'
    and d.created_at <= now() - interval '24 hours'
    and (p_order_no is null or exists (select 1 from public.revgift_shares s where s.send_id = d.id and s.order_no = p_order_no));
  get diagnostics v_pending_revgifts = row_count;

  -- 1) 승인하지 않은 팬 선물: 결제 완료 + 168시간 → 반려
  v_gifts := 0;
  for v_order in
    select o.id from public.orders o join public.approval_requests r on r.order_id = o.id
    where r.status = 'waiting' and o.approved_at is null
      and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '168 hours'
      and (p_order_no is null or o.order_no = p_order_no)
    order by o.registered_at, o.id
  loop
    perform 1 from public.boxes b where b.order_id = v_order order by b.seq for update;
    perform 1 from public.approval_requests r where r.order_id = v_order for no key update;
    perform 1 from public.orders o where o.id = v_order for update;
    with expired as (
      update public.approval_requests r
      set status = 'expired', decided_at = now()
      from public.orders o
      where o.id = r.order_id and r.order_id = v_order and r.status = 'waiting' and o.approved_at is null
        and o.status in ('registered', 'received', 'labeled', 'inspected')
        and o.registered_at <= now() - interval '168 hours'
      returning r.order_id
    )
    update public.orders o set status = 'expired'
    from expired e where o.id = e.order_id and o.approved_at is null;
    get diagnostics v_n = row_count;
    v_gifts := v_gifts + v_n;
  end loop;

  -- 3) 차액 요청 뒤 168시간 미납(payment INV-M13)
  update public.payments d
  set expired_at = now()
  where d.kind = 'difference' and d.status in ('pending', 'failed') and d.expired_at is null
    and d.created_at <= now() - interval '168 hours'
    and (p_order_no is null or d.order_id = (select o.id from public.orders o where o.order_no = p_order_no));
  get diagnostics v_differences = row_count;

  -- 4) 역조공 받기 기한(reverse-gift INV-R10)
  if p_order_no is null then
    v_revgifts := public.expire_revgifts();
  else
    update public.revgift_shares s
    set reply = 'expired', replied_at = now()
    from public.revgift_sends d
    where d.id = s.send_id and d.status = 'done' and s.reply = 'waiting'
      and now() >= public.revgift_deadline(d.settled_at) and s.order_no = p_order_no;
    get diagnostics v_revgifts = row_count;
  end if;

  -- 5) 크리에이터 확인 대기 상자: 검수 완료 + 168시간이 지나도 운영자가 처리하지 않았으면 자동 처리가 닫는다(office-workflow INV-W13·W6).
  --    고른 것이 있으면 고른 쪽대로 운영자 처리와 같은 결과(처리한 사람 칸은 비어 있다 = 자동 처리): 받기 → 검수 완료, 거절 → 반송 대기 + 팬 hold_fan.
  --    고른 것이 없으면 반송 대기 + 확인 줄 「기한 지남」 + 팬 hold_fan. 끝난 주문의 상자는 아래 「나갈 수 없게 된 상자」가 맡는다.
  --    상자마다 상자 → 주문(몫) → 사무소 상자 줄 → 확인 줄 순으로 잠그고(INV-W12 — 고르기·취소·운영자 처리와 같다) 다시 본다.
  v_held := 0;
  for v_parcel in
    select p.id from public.office_parcels p
    where p.state = 'held' and p.inspected_at <= now() - interval '168 hours' and not public.office_parcel_dead(p)
      and (p_order_no is null
           or exists (select 1 from public.boxes b join public.orders o on o.id = b.order_id where b.id = p.box_id and o.order_no = p_order_no)
           or exists (select 1 from public.revgift_shares s where s.id = p.share_id and s.order_no = p_order_no))
    order by p.id
  loop
    begin
      v_p := public.office_lock_parcel(v_parcel);
    exception when serialization_failure then
      continue;
    end;
    select * into v_k from public.office_creator_checks k where k.parcel_id = v_parcel for update;
    if v_p.state <> 'held' or v_p.inspected_at > now() - interval '168 hours' or public.office_parcel_dead(v_p) or v_k.answer is not null then
      continue;
    end if;
    if v_k.choice = 'accept' then
      update public.office_parcels set state = 'inspected' where id = v_parcel;
      update public.office_creator_checks set answer = 'accept', answered_at = now(), answered_by = null where parcel_id = v_parcel;
      perform public.office_sync(v_parcel);
    else
      update public.office_parcels set state = 'return_waiting' where id = v_parcel;
      if v_k.parcel_id is not null then
        update public.office_creator_checks
        set answer = case when v_k.choice = 'return' then 'return' else 'expired' end, answered_at = now(), answered_by = null
        where parcel_id = v_parcel;
      end if;
      perform public.notification_enqueue('hold_fan', o.id, null, 1::smallint, o.fan_id, now())
      from public.office_parcels x join public.boxes b on b.id = x.box_id join public.orders o on o.id = b.order_id
      where x.id = v_parcel;
    end if;
    v_held := v_held + 1;
  end loop;

  -- 5-2) 추적기 보관 상자: 검수 완료 + 168시간이 지나도 운영자가 처리하지 않았으면 고른 쪽대로(office-workflow INV-W14·W6).
  --      신고하기 → 신고 보관(팬 알림 없음), 신고하지 않기 → 반송 대기 + 팬 hold_fan, 고른 것이 없으면 신고하지 않기와 같고 확인 줄은 「기한 지남」.
  --      주문이 끝났어도 같다 — 추적기 보관 상자는 「나갈 수 없게 된 상자」 단계가 건드리지 않는다. 잠금은 5) 와 같은 순서.
  for v_parcel in
    select p.id from public.office_parcels p
    where p.state = 'tracker_held' and p.inspected_at <= now() - interval '168 hours'
      and (p_order_no is null
           or exists (select 1 from public.boxes b join public.orders o on o.id = b.order_id where b.id = p.box_id and o.order_no = p_order_no))
    order by p.id
  loop
    begin
      v_p := public.office_lock_parcel(v_parcel);
    exception when serialization_failure then
      continue;
    end;
    select * into v_k from public.office_creator_checks k where k.parcel_id = v_parcel for update;
    if v_p.state <> 'tracker_held' or v_p.inspected_at > now() - interval '168 hours' or v_k.answer is not null then
      continue;
    end if;
    if v_k.choice = 'report' then
      update public.office_parcels set state = 'report_held' where id = v_parcel;
      update public.office_creator_checks set answer = 'report', answered_at = now(), answered_by = null where parcel_id = v_parcel;
    else
      update public.office_parcels set state = 'return_waiting' where id = v_parcel;
      if v_k.parcel_id is not null then
        update public.office_creator_checks
        set answer = case when v_k.choice = 'no_report' then 'no_report' else 'expired' end, answered_at = now(), answered_by = null
        where parcel_id = v_parcel;
      end if;
      perform public.notification_enqueue('hold_fan', o.id, null, 1::smallint, o.fan_id, now())
      from public.office_parcels x join public.boxes b on b.id = x.box_id join public.orders o on o.id = b.order_id
      where x.id = v_parcel;
    end if;
    perform public.office_sync(v_parcel);
    v_held := v_held + 1;
  end loop;

  -- 6) 주문에 묶인 채 보류된 상자: 보류 + 168시간 → 주문에서 떼어 내고 반송 대상(inbound-address-code INV-C9)
  for v_parcel in
    select p.id from public.office_parcels p
    where p.hold_reason is not null and p.hold_closed_at is null and p.hold_at <= now() - interval '168 hours'
      and (p_order_no is null
           or exists (select 1 from public.boxes b join public.orders o on o.id = b.order_id where b.id = p.box_id and o.order_no = p_order_no)
           or exists (select 1 from public.revgift_shares s where s.id = p.share_id and s.order_no = p_order_no))
    order by p.hold_at, p.id
  loop
    if public.office_close_held_parcel(v_parcel, null, true) then
      v_held_parcels := v_held_parcels + 1;
    end if;
  end loop;

  -- 7) 승인 뒤 도착하지 않은 상자: 결제 완료 + 720시간 → 그 상자를 닫는다(office-workflow INV-W10)
  for v_order in
    select o.id from public.orders o
    where o.approved_at is not null and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '720 hours'
      and (p_order_no is null or o.order_no = p_order_no)
      and exists (select 1 from public.boxes b
                  where b.order_id = o.id and b.missing_at is null
                    and not exists (select 1 from public.office_parcels x where x.box_id = b.id and x.state <> 'awaiting'))
    order by o.registered_at, o.id
  loop
    v_boxes_missing := v_boxes_missing + public.office_close_missing_boxes(v_order);
  end loop;

  -- 8) 결제 완료 + 336시간에 아직 안 온 상자가 있는 진행 중 주문 → 보낸 팬에게 한 번(notifications INV-N15)
  select count(*)::integer into v_box_missing_alerts
  from (
    select public.notification_enqueue('box_missing', o.id, null, 1::smallint, o.fan_id, now()) as n
    from public.orders o
    where o.approved_at is not null and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '336 hours'
      and (p_order_no is null or o.order_no = p_order_no)
      and exists (select 1 from public.boxes b
                  where b.order_id = o.id and b.missing_at is null
                    and not exists (select 1 from public.office_parcels x where x.box_id = b.id and x.state <> 'awaiting'))
  ) q
  where q.n > 0;

  -- 9) 살려 둔 지 168시간 지난 상자·몫(payment INV-M18 ③ · reverse-gift INV-R11)
  for v_box in
    select c.box_id from public.inbound_codes c
    join public.boxes b on b.id = c.box_id
    join public.orders o on o.id = b.order_id
    where c.box_id is not null and c.kept_at is not null and c.state = 'valid' and c.kept_at <= now() - interval '168 hours'
      and b.missing_at is null
      and (p_order_no is null or o.order_no = p_order_no)
    order by c.kept_at, c.box_id
  loop
    if public.office_close_kept_box(v_box) then
      v_kept_closed := v_kept_closed + 1;
    end if;
  end loop;
  update public.inbound_codes c
  set state = 'void', voided_at = now()
  from public.revgift_shares s
  where s.id = c.share_id and c.kept_at is not null and c.state = 'valid' and c.kept_at <= now() - interval '168 hours'
    and (p_order_no is null or s.order_no = p_order_no);
  get diagnostics v_kept_shares = row_count;
  v_kept_closed := v_kept_closed + v_kept_shares;

  -- 나갈 수 없게 된 상자 중 검수 완료·크리에이터 확인 대기인 것은 반송 대기로(답은 빈 채, 팬 알림 없음). 추적기 보관·신고 보관은 넘기지 않는다(INV-W14)
  for v_parcel in
    select p.id from public.office_parcels p
    where p.state in ('inspected', 'held') and public.office_parcel_dead(p)
      and (p_order_no is null
           or exists (select 1 from public.boxes b join public.orders o on o.id = b.order_id where b.id = p.box_id and o.order_no = p_order_no)
           or exists (select 1 from public.revgift_shares s where s.id = p.share_id and s.order_no = p_order_no))
    order by p.id
  loop
    begin
      perform public.office_lock_parcel(v_parcel);
    exception when serialization_failure then
      continue;
    end;
    update public.office_parcels p set state = 'return_waiting'
    where p.id = v_parcel and p.state in ('inspected', 'held') and public.office_parcel_dead(p);
  end loop;

  -- 10) 반송 주소 기한(office-workflow INV-W15, notifications INV-N22) — 주문에 이어진 반송 대기 상자 중 보낸 사람이 확인하지 않은 것.
  --  ① 반송 대기 + 720시간 → 처분 대상. 상자마다 상자 → 주문(몫) → 사무소 상자 줄 순으로 잠근 뒤 다시 본다 — 확인 함수와 같은 잠금이라 겹쳐도 하나만(INV-W12)
  for v_parcel in
    select p.id from public.office_parcels p
    where p.state = 'return_waiting' and p.return_confirmed_at is null and (p.box_id is not null or p.share_id is not null)
      and p.return_waiting_at <= now() - interval '720 hours'
      and (p_order_no is null
           or exists (select 1 from public.boxes b join public.orders o on o.id = b.order_id where b.id = p.box_id and o.order_no = p_order_no)
           or exists (select 1 from public.revgift_shares s where s.id = p.share_id and s.order_no = p_order_no))
    order by p.return_waiting_at, p.id
  loop
    begin
      v_p := public.office_lock_parcel(v_parcel);
    exception when serialization_failure then
      continue;
    end;
    if v_p.state <> 'return_waiting' or v_p.return_confirmed_at is not null or v_p.return_waiting_at > now() - interval '720 hours'
       or (v_p.box_id is null and v_p.share_id is null) then
      continue;
    end if;
    update public.office_parcels set state = 'dispose_due' where id = v_parcel;
    perform public.office_sync(v_parcel);
    v_dispose_due := v_dispose_due + 1;
  end loop;

  --  ② 반송 대기 + 336시간 → 보낸 사람에게 상자마다 한 번 재알림. 줄 이름에 상자가 들어가 두 번 돌려도 한 줄이다.
  --     이미 확인한 상자·처분 대상에는 가지 않는다(꺼낼 때도 다시 본다 — notification_claim). 세는 것은 이메일 줄(상자 수)
  with sent as (
    insert into public.notification_outbox (kind, order_id, parcel_id, round, account_id, channel, event_at)
    select 'return_address_reminder', o.id, p.id, 1, public.return_sender_of(p.id), ch.channel, now()
    from public.office_parcels p
    left join public.boxes b on b.id = p.box_id
    left join public.orders o on o.id = b.order_id
    left join public.revgift_shares s on s.id = p.share_id
    cross join (values ('email'), ('kakao')) as ch (channel)
    where p.state = 'return_waiting' and p.return_confirmed_at is null and (p.box_id is not null or p.share_id is not null)
      and p.return_waiting_at <= now() - interval '336 hours'
      and public.return_sender_of(p.id) is not null
      and (p_order_no is null or o.order_no = p_order_no or s.order_no = p_order_no)
      and (ch.channel = 'email' or exists (select 1 from public.notification_kakao_templates t where t.kind = 'return_address_reminder'))
    on conflict do nothing
    returning channel
  )
  select (count(*) filter (where channel = 'email'))::integer into v_return_reminders from sent;

  perform public.office_sync_order(o.id)
  from public.orders o
  where (p_order_no is null or o.order_no = p_order_no)
    and exists (select 1 from public.boxes b join public.office_parcels p on p.box_id = b.id where b.order_id = o.id and p.state = 'return_waiting');

  -- 2) 매칭 안 된 미확인 입고: 도착 + 168시간. 맨 뒤에 둔다 — 찾기 함수가 이 표를 상자·주문·사무소 상자 줄 다음에 잠근다(INV-W12)
  update public.office_unmatched
  set expired_at = now()
  where matched_parcel_id is null and expired_at is null and arrived_at <= now() - interval '168 hours'
    and p_order_no is null;
  get diagnostics v_unmatched = row_count;

  return jsonb_build_object('gifts', v_gifts, 'unmatched', v_unmatched, 'differences', v_differences, 'revgifts', v_revgifts,
                            'pending_gifts', v_pending_gifts, 'pending_revgifts', v_pending_revgifts, 'held', v_held, 'held_parcels', v_held_parcels,
                            'boxes_missing', v_boxes_missing, 'box_missing_alerts', v_box_missing_alerts, 'kept_closed', v_kept_closed,
                            'dispose_due', v_dispose_due, 'return_reminders', v_return_reminders);
end $function$;

-- ── 10) 처리할 일 (action-center INV-J1·J3·J5) ─────────────────────

-- 20261017000002 와 같고, 「반송 주소 확인」 카드(상자마다, INV-J1)를 더했다. 추가 결제 카드는 처분 대상·처분 상자에도 없다
CREATE OR REPLACE FUNCTION public.my_action_items()
 RETURNS TABLE(kind text, order_no text, box_id uuid, box_label text, box_seq smallint, creator_name text, tier text, measured_tier text, amount_krw integer, due_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with mine as (
    select auth.uid() as uid
  ),
  cards as (
    -- 추가 결제 — prepare_difference_payment 가 받아 주는 상태
    select 'difference'::text as kind, o.order_no, b.id as box_id,
           o.order_no || case when (select count(*) from public.boxes bx where bx.order_id = o.id) > 1 then '-' || b.seq else '' end as box_label,
           b.seq as box_seq, c.name as creator_name, b.declared_tier::text as tier, b.measured_tier::text as measured_tier,
           p.amount_krw, p.created_at + interval '168 hours' as due_at
    from mine
    join public.orders o on o.fan_id = mine.uid
    join public.payments p on p.order_id = o.id and p.kind = 'difference'
    join public.boxes b on b.id = p.box_id
    join public.creators c on c.id = o.creator_id
    left join public.office_parcels op on op.box_id = b.id
    where p.status in ('pending', 'failed')
      and p.expired_at is null
      and now() < p.created_at + interval '168 hours'
      and o.status not in ('rejected', 'expired', 'canceled')
      and (op.state is null or op.state not in ('return_waiting', 'return_printed', 'returned', 'dispose_due', 'disposed', 'label_printed', 'shipped',
                                                'tracker_held', 'report_held', 'police_handed'))

    union all

    -- 도착하지 않은 상자 — 「아직 도착하지 않은 상자」 알림 조건 + find_held_parcel 이 받아 주는 상태
    select 'missing_box', o.order_no, b.id,
           o.order_no || case when (select count(*) from public.boxes bx where bx.order_id = o.id) > 1 then '-' || b.seq else '' end,
           b.seq, c.name, b.declared_tier::text, null::text, null::integer, o.registered_at + interval '720 hours'
    from mine
    join public.orders o on o.fan_id = mine.uid
    join public.boxes b on b.order_id = o.id
    join public.creators c on c.id = o.creator_id
    where o.approved_at is not null
      and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '336 hours'
      and b.missing_at is null
      and not exists (select 1 from public.office_parcels op where op.box_id = b.id and op.state <> 'awaiting')

    union all

    -- 역조공 받기 — decline_revgift·accept_revgift 가 받아 주는 상태
    select 'revgift', s.order_no, null::uuid, null::text, null::smallint, coalesce(cr.name, cp.nickname), s.tier::text, null::text, null::integer,
           public.revgift_deadline(d.settled_at)
    from mine
    join public.revgift_shares s on s.fan_id = mine.uid
    join public.revgift_sends d on d.id = s.send_id
    join public.profiles cp on cp.id = d.sender_id
    left join public.creators cr on cr.profile_id = d.sender_id
    where d.status = 'done'
      and s.reply = 'waiting'
      and s.returned_at is null
      and s.cancelled_at is null
      and now() < public.revgift_deadline(d.settled_at)

    union all

    -- 반송 주소 확인(office-workflow INV-W15) — 확인 함수(confirm_return_address)가 받아 주는 상태: 반송 대기 · 확인 전 · 반송 대기 + 720시간 전. 상자마다
    select 'return_address', o.order_no, b.id,
           o.order_no || case when (select count(*) from public.boxes bx where bx.order_id = o.id) > 1 then '-' || b.seq else '' end,
           b.seq, c.name, b.declared_tier::text, null::text, null::integer, x.return_waiting_at + interval '720 hours'
    from mine
    join public.orders o on o.fan_id = mine.uid
    join public.boxes b on b.order_id = o.id
    join public.office_parcels x on x.box_id = b.id
    join public.creators c on c.id = o.creator_id
    where x.state = 'return_waiting'
      and x.return_confirmed_at is null
      and now() < x.return_waiting_at + interval '720 hours'
  )
  select kind, order_no, box_id, box_label, box_seq, creator_name, tier, measured_tier, amount_krw, due_at
  from cards
  order by due_at, order_no, box_seq;
$function$;

-- 20261017000002 와 같고, 보낸 선물 판에 반송 주소 줄(보낸 팬 선물 상자 — 팬 카드와 같은 줄 · 보낸 역조공 몫)을 더했다
CREATE OR REPLACE FUNCTION public.my_creator_action_items()
 RETURNS TABLE(kind text, board text, order_no text, request_id text, share_id uuid, box_id uuid, box_seq integer, box_count integer, box_label text, nickname text, item_kind text, tier text, measured_tier text, amount_krw integer, has_electronics_or_metal boolean, bluetooth boolean, rf boolean, choice text, sent_at timestamp with time zone, received_at timestamp with time zone, due_at timestamp with time zone, prior_gift_count integer, prior_passed_count integer, prior_returned_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as (
    select p.id as uid from public.profiles p where p.id = auth.uid() and p.role = 'creator'
  ),
  lines as (
    -- 추적 장치 발견 / 블루투스 발견: 그 일을 받아 주는 고르기(choose_creator_check)와 같은 판정 —
    -- 추적기 보관 · 운영자 처리 전 · 기한 전(주문이 끝나도) / 확인 대기 · 운영자 처리 전 · 기한 전 · 주문 진행 중 · 나갈 수 있는 상자
    select case when k.kind = 'tracker' then 'tracker' else 'bluetooth' end::text as kind, 'received'::text as board, o.order_no, null::text as request_id,
           null::uuid as share_id, b.id as box_id,
           b.seq::integer as box_seq, (select count(*)::integer from public.boxes bx where bx.order_id = o.id) as box_count, null::text as box_label,
           f.nickname, o.item_kind, coalesce(b.measured_tier, b.declared_tier)::text as tier, null::text as measured_tier, null::integer as amount_krw,
           o.has_electronics_or_metal, coalesce(i.bluetooth = 'found', false) as bluetooth, coalesce(i.rf = 'found', false) as rf, k.choice,
           o.registered_at as sent_at, x.received_at, x.inspected_at + interval '168 hours' as due_at,
           h.gifts as prior_gift_count, h.passed as prior_passed_count, h.returned as prior_returned_count
    from me
    join public.creators c on c.profile_id = me.uid
    join public.orders o on o.creator_id = c.id
    join public.boxes b on b.order_id = o.id
    join public.office_parcels x on x.box_id = b.id
    join public.office_creator_checks k on k.parcel_id = x.id
    join public.profiles f on f.id = o.fan_id
    left join lateral (
      select ii.bluetooth, ii.rf from public.office_inspections ii where ii.parcel_id = x.id order by ii.at desc, ii.id desc limit 1
    ) i on true
    left join lateral (
      select count(*)::integer as gifts,
             (count(*) filter (where p.inspection_result = 'passed'))::integer as passed,
             (count(*) filter (where p.inspection_result = 'returned'))::integer as returned
      from public.orders p
      where p.creator_id = o.creator_id and p.fan_id = o.fan_id and p.id <> o.id and p.registered_at is not null and p.status <> 'pending_payment'
    ) h on true
    where k.answer is null and now() < x.inspected_at + interval '168 hours'
      and ((k.kind = 'tracker' and x.state = 'tracker_held')
           or (k.kind = 'confirm' and x.state = 'held'
               and o.status not in ('rejected', 'expired', 'canceled') and not public.office_parcel_dead(x)))

    union all

    -- 승인 요청: 대기 · 승인 전 · 진행 중 · 검수 반송 아님 · 결제 완료 + 168시간 전(approve_request 와 같은 판정)
    select 'approval', 'received', o.order_no, r.request_id, null, null, null,
           (select count(*)::integer from public.boxes bx where bx.order_id = o.id), null,
           f.nickname, o.item_kind, null, null, null, o.has_electronics_or_metal, null, null, null,
           o.registered_at, o.received_at, o.registered_at + interval '168 hours',
           h.gifts, h.passed, h.returned
    from me
    join public.creators c on c.profile_id = me.uid
    join public.orders o on o.creator_id = c.id
    join public.approval_requests r on r.order_id = o.id
    join public.profiles f on f.id = o.fan_id
    left join lateral (
      select count(*)::integer as gifts,
             (count(*) filter (where p.inspection_result = 'passed'))::integer as passed,
             (count(*) filter (where p.inspection_result = 'returned'))::integer as returned
      from public.orders p
      where p.creator_id = o.creator_id and p.fan_id = o.fan_id and p.id <> o.id and p.registered_at is not null and p.status <> 'pending_payment'
    ) h on true
    where r.status = 'waiting' and o.approved_at is null
      and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.inspection_result is distinct from 'returned'
      and now() < o.registered_at + interval '168 hours'

    union all

    -- 미확인 상자: 내가 보낸 몫이 늦을 때만(INV-J7 — 보류 상자가 있는지와 상관없다). 칸은 받는 팬 닉네임·상자 크기·보낸 날뿐
    select 'unconfirmed', 'sent', s.order_no, null, s.id, null, null, null, null,
           fp.nickname, null, s.tier::text, null, null, null, null, null, null,
           d.settled_at, null, null, null, null, null
    from me
    join public.revgift_sends d on d.sender_id = me.uid
    join public.revgift_shares s on s.send_id = d.id
    join public.profiles fp on fp.id = s.fan_id
    -- 결제 끝·336시간 지난 보내기만 먼저 거른 뒤 판정 함수를 부른다(같은 결과, 부르는 수만 줄인다 — INV-J11 판정은 그 함수 하나)
    where d.status = 'done' and d.settled_at <= now() - interval '336 hours'
      and public.revgift_share_late(s.id, me.uid)

    union all

    -- 보낸 팬 선물: 팬 처리할 일과 같은 함수의 같은 줄(action-center INV-J3 · 카드 d93 ⑩)
    select a.kind, 'sent', a.order_no, null, null, a.box_id, a.box_seq::integer, null, a.box_label,
           a.creator_name, null, a.tier, a.measured_tier, a.amount_krw, null, null, null, null,
           o.registered_at, null, a.due_at, null, null, null
    from me
    cross join public.my_action_items() a
    join public.orders o on o.order_no = a.order_no
    where a.kind in ('difference', 'missing_box', 'return_address')

    union all

    -- 보낸 역조공 반송 주소(INV-J5 · office-workflow INV-W15): 보낸 몫의 상자가 반송 대기 · 확인 전 · 반송 대기 + 720시간 전. 칸은 받는 팬 닉네임·상자 크기·보낸 날·기한
    select 'return_address', 'sent', s.order_no, null, s.id, null, null, null, null,
           fp.nickname, null, s.tier::text, null, null, null, null, null, null,
           d.settled_at, null, x.return_waiting_at + interval '720 hours', null, null, null
    from me
    join public.revgift_sends d on d.sender_id = me.uid
    join public.revgift_shares s on s.send_id = d.id
    join public.office_parcels x on x.share_id = s.id
    join public.profiles fp on fp.id = s.fan_id
    where x.state = 'return_waiting'
      and x.return_confirmed_at is null
      and now() < x.return_waiting_at + interval '720 hours'
  )
  select l.kind, l.board, l.order_no, l.request_id, l.share_id, l.box_id, l.box_seq, l.box_count, l.box_label, l.nickname, l.item_kind, l.tier,
         l.measured_tier, l.amount_krw, l.has_electronics_or_metal, l.bluetooth, l.rf, l.choice, l.sent_at, l.received_at, l.due_at,
         l.prior_gift_count, l.prior_passed_count, l.prior_returned_count
  from lines l
  order by (l.board = 'sent'),
           case l.kind when 'tracker' then 0 when 'bluetooth' then 1 else 2 end,
           case when l.board = 'received' then l.due_at else l.sent_at end,
           -- 같은 시각이면 받은 선물은 주문번호·상자 순, 보낸 선물은 몫(상자) id 순
           case when l.board = 'received' then l.order_no end, l.box_seq, coalesce(l.share_id, l.box_id);
$function$;

-- ── 11) 알림 꺼내기 — 재알림 날짜 · 확인한 상자의 재알림 건너뛰기 ─────

-- 20261016000008 과 같고, 재알림 날짜 칸(dispose_due_at)과 확인한 상자의 재알림 건너뛰기를 더했다. 돌려주는 칸이 바뀌어 지우고 다시 만든다(권한도 다시)
drop function if exists public.notification_claim(integer);
CREATE FUNCTION public.notification_claim(p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, kind text, channel text, round smallint, order_no text, nickname text, auto_reject_at timestamp with time zone, undelivered_reason text, must_deliver boolean, attempts integer, claimed_at timestamp with time zone, sender_name text, dispose_due_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return query
  with picked as (
    select n.id,
           case
             when n.kind = 'approval_request' and not exists (
               select 1 from public.approval_requests r where r.id = n.approval_request_id and r.status = 'waiting') then 'request_not_waiting'
             when n.kind = 'revgift_offer' and not exists (
               select 1 from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
               where s.id = n.share_id and s.reply = 'waiting' and s.cancelled_at is null and d.status = 'done'
                 and now() < public.revgift_deadline(d.settled_at)) then 'share_not_waiting'
             -- 반송 주소 재알림: 그 사이 확인했거나 반송 대기가 아니면 보내지 않는다(INV-N22 「이미 확인한 상자에는 가지 않는다」)
             when n.kind = 'return_address_reminder' and not exists (
               select 1 from public.office_parcels x where x.id = n.parcel_id and x.state = 'return_waiting' and x.return_confirmed_at is null) then 'return_not_waiting'
           end as closed_code,
           (now() >= n.event_at + interval '24 hours') as expired
    from public.notification_outbox n
    where n.status = 'pending' and n.next_attempt_at <= now()
    order by n.next_attempt_at, n.id
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    for update of n skip locked
  ), expired as (
    update public.notification_outbox n
    set status = 'failed', error_code = 'expired', finished_at = now()
    from picked p
    where n.id = p.id and p.expired and n.status = 'pending'
    returning n.id
  ), skipped as (
    update public.notification_outbox n
    set status = 'skipped', error_code = p.closed_code, finished_at = now()
    from picked p
    where n.id = p.id and not p.expired and p.closed_code is not null and n.status = 'pending'
    returning n.id
  ), claimed as (
    update public.notification_outbox n
    set status = 'sending', claimed_at = clock_timestamp()
    from picked p
    where n.id = p.id and not p.expired and p.closed_code is null and n.status = 'pending'
    returning n.*
  )
  select c.id, c.kind, c.channel, c.round, coalesce(o.order_no, rs.order_no, ss.order_no), pr.nickname,
         case when c.kind = 'approval_request' then o.registered_at + interval '168 hours' end,
         case when c.kind = 'gift_undelivered' then (case when o.status = 'expired' then 'expired' else 'declined' end) end,
         public.notification_kind_must_deliver(c.kind),
         c.attempts,
         c.claimed_at,
         -- 역조공 받기만 — 보낸 크리에이터의 공개 이름(크리에이터 줄이 없으면 닉네임). 다른 종류는 비어 있다(INV-N1)
         case when c.kind = 'revgift_offer' then coalesce(cr.name, sp.nickname) end,
         -- 반송 주소 재알림만 — 처분 예정 시각(반송 대기 + 720시간, INV-N22). 다른 종류는 비어 있다
         case when c.kind = 'return_address_reminder' then pp.return_waiting_at + interval '720 hours' end
  from claimed c
  left join public.orders o on o.id = c.order_id
  left join public.office_parcels pp on pp.id = c.parcel_id
  left join public.revgift_shares rs on rs.id = pp.share_id
  left join public.revgift_shares ss on ss.id = c.share_id
  left join public.revgift_sends sd on sd.id = ss.send_id
  left join public.profiles sp on sp.id = sd.sender_id
  left join public.creators cr on cr.profile_id = sd.sender_id
  join public.profiles pr on pr.id = c.account_id
  order by c.id;
end $function$;
revoke all on function public.notification_claim(integer) from public, anon, authenticated;
grant execute on function public.notification_claim(integer) to service_role;

notify pgrst, 'reload schema';
