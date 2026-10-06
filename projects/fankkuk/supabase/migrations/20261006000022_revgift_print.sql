-- 역조공 송장 출력 = 팬 주소 열기 — 복호화 전용 역할의 자리 (reverse-gift INV-R7·R13, address-protection INV-P5·P7·P8 과 같은 규칙).
--
-- 팬 선물의 송장 출력(20261005000017·18·19, 20261006000004, manual 0008~0010)과 같은 모양을 몫 하나에 대해 만든다.
-- 팬 선물의 열람 기록 표(decrypt_log)는 주문에 묶여 있어 몫을 담지 못하므로 몫 전용 표 둘을 따로 둔다.
-- 이 파일은 pii 를 건드리지 않는 쪽만 담는다 — 봉투를 내주며 횟수를 올리는 함수(revgift_claim_print)는
-- manual/0014_revgift_print.sql(사람이 적용).
--
-- 1) revgift_decrypt_log: 몫의 주소를 연 줄·거부 줄. 고치기·지우기 금지(INV-P7 과 같다). 복호화 역할이 직접 넣을 수 있는 줄은
--    거부 줄뿐이다(INV-R13 (a)) — 연 줄은 봉투를 내주는 함수만 넣는다.
-- 2) revgift_decrypt_releases: 송장이 안 나온 연 줄을 돌려준 줄(INV-R13). 아무도 직접 넣지 못한다 — 돌려주기 함수만.
-- 3) revgift_print_context: 판정 재료(몫 번호·단계·팬의 답·닫힘·횟수). 주소는 없다.
-- 4) revgift_finish_print: 주소를 연 뒤 첫 출력이면 송장 출력 단계로 넘기고, 재출력이면 처음 송장번호를 돌려준다.
-- 5) revgift_release_print: 몫을 잠근 자리에서 INV-R13 (b)~(e) 를 보고 돌려준다.
-- 넷 모두 복호화 전용 역할만 부른다. 앱 서버 키·로그인 키로는 부를 수 없다.
--
-- 몫 횟수 = 그 몫의 연 줄 − 그 가운데 돌려준 줄(INV-R13). 상한 3(INV-R7).
-- 잠금 순서는 어디서나 같다 — 상자(office_lock_qr) 다음 몫. 봉투를 내주는 함수·돌려주기·송장 마무리가 같은 순서로 잠근다.
--
-- 한쪽만 적용된 상태:
--   · 이 파일만 → 앱의 송장 출력이 몫 상자에서 봉투를 내주는 함수를 찾지 못해 「실패」로 끝난다. 주소는 열리지 않고 상자는
--     검수 완료 그대로다(역조공 상자의 송장 출력이 막힌다). 「연 줄」은 생기지 않는다.
--   · manual/0014 만 → 그 파일이 처음에 이 파일의 표가 있는지 보고 없으면 멈춘다(아무것도 안 바뀜).

-- ── 1) 몫 열람 기록 ─────────────────────────────────────

create table public.revgift_decrypt_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  share_id uuid not null references public.revgift_shares (id),
  requester_id uuid not null,
  result text not null check (result in ('opened', 'denied')),
  print_no smallint check (print_no between 1 and 3),
  deny_reason text check (deny_reason in ('not_owner', 'no_valid_approval', 'order_mismatch', 'order_not_printable', 'decrypt_limit_reached')),
  check ((result = 'opened') = (print_no is not null and deny_reason is null)),
  check ((result = 'denied') = (deny_reason is not null and print_no is null))
);
create index revgift_decrypt_log_share_opened on public.revgift_decrypt_log (share_id) where result = 'opened';
alter table public.revgift_decrypt_log enable row level security;

revoke all on public.revgift_decrypt_log from public, anon, authenticated, service_role, address_decryptor;
grant select, insert on public.revgift_decrypt_log to address_decryptor;
-- (a) 직접 넣을 수 있는 줄은 거부 줄뿐 — 앱의 판정 거부·봉인 속 주문번호 불일치(INV-R7 b)
create policy revgift_decrypt_log_append on public.revgift_decrypt_log for insert to address_decryptor with check (result = 'denied');
create policy revgift_decrypt_log_read on public.revgift_decrypt_log for select to address_decryptor using (true);

-- ── 2) 돌려줌 ───────────────────────────────────────────

create table public.revgift_decrypt_releases (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  -- (b) 연 줄 하나는 한 번만 돌려준다
  opened_log_id bigint not null unique references public.revgift_decrypt_log (id),
  share_id uuid not null references public.revgift_shares (id),
  requester_id uuid not null
);
create index revgift_decrypt_releases_share on public.revgift_decrypt_releases (share_id);
alter table public.revgift_decrypt_releases enable row level security;
revoke all on public.revgift_decrypt_releases from public, anon, authenticated, service_role, address_decryptor;

create function public.revgift_decrypt_append_only() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception '역조공 주소 열람 기록은 고치거나 지울 수 없다 (INV-R7·R13)' using errcode = '42501';
end $$;
revoke all on function public.revgift_decrypt_append_only() from public, anon, authenticated;

create trigger revgift_decrypt_log_no_update before update or delete on public.revgift_decrypt_log
  for each row execute function public.revgift_decrypt_append_only();
create trigger revgift_decrypt_log_no_truncate before truncate on public.revgift_decrypt_log
  for each statement execute function public.revgift_decrypt_append_only();
create trigger revgift_decrypt_releases_no_update before update or delete on public.revgift_decrypt_releases
  for each row execute function public.revgift_decrypt_append_only();
create trigger revgift_decrypt_releases_no_truncate before truncate on public.revgift_decrypt_releases
  for each statement execute function public.revgift_decrypt_append_only();

-- ── 3) 판정 재료 ────────────────────────────────────────

-- 몫 상자가 아니면 {kind: gift}, 없는 QR 이면 null. 주소·팬 이름·전화는 없다.
create function public.revgift_print_context(p_qr text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.office_parcels;
  r jsonb;
begin
  if p_qr is null or p_qr !~ '^Q-[0-9]{6}$' then
    raise exception 'QR 꼴이 아니다' using errcode = '22023';
  end if;
  select * into v from public.office_parcels where qr_code = p_qr;
  if v.id is null then
    return null;
  end if;
  if v.share_id is null then
    return jsonb_build_object('kind', 'gift');
  end if;
  select jsonb_build_object(
    'kind', 'share',
    'share_id', s.id,
    'order_no', s.order_no,
    'parcel_state', v.state,
    'paid', d.status = 'done',
    'reply', s.reply,
    'inspected', s.inspected_at is not null,
    'shipped', s.shipped_at is not null,
    'returned', s.returned_at is not null,
    'cancelled', s.cancelled_at is not null,
    -- INV-R13: 이 몫에서 주소를 연 횟수 = 연 줄 − 돌려준 줄
    'decrypt_count', (select count(*) from public.revgift_decrypt_log l where l.share_id = s.id and l.result = 'opened')
                   - (select count(*) from public.revgift_decrypt_releases x where x.share_id = s.id)
  ) into r
  from public.revgift_shares s
  join public.revgift_sends d on d.id = s.send_id
  where s.id = v.share_id;
  return r;
end $$;

-- ── 4) 송장 마무리 ──────────────────────────────────────

-- 주소를 연 뒤(봉인 속 주문번호 대조까지 통과) 부른다. 돌려주는 값 {waybill, first} — first = 이번에 송장 출력 단계로 넘겼다.
-- 재출력이면 송장번호 없이(null) 불러도 되고 처음 번호를 돌려준다. 출고 조건은 잠근 뒤 다시 본다.
create function public.revgift_finish_print(p_qr text, p_waybill text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
begin
  v := public.office_lock_qr(p_qr);
  if v.share_id is null then
    raise exception '역조공 상자가 아니다' using errcode = '22023';
  end if;
  perform 1 from public.revgift_shares s where s.id = v.share_id for update;
  if v.state = 'label_printed' then
    return jsonb_build_object('waybill', v.outbound_waybill_no, 'first', false);
  end if;
  if v.state <> 'inspected' then
    raise exception '지금 단계에서 할 수 없다' using errcode = '55000';
  end if;
  perform public.office_check_waybill(p_waybill);
  if not public.office_parcel_shippable(v) then
    raise exception '출고 조건을 지키지 않는다' using errcode = 'P0041';
  end if;
  update public.office_parcels set state = 'label_printed', printed_at = now(), outbound_waybill_no = p_waybill where id = v.id;
  perform public.office_sync(v.id);
  return jsonb_build_object('waybill', p_waybill, 'first', true);
end $$;

-- ── 5) 돌려주기 ─────────────────────────────────────────

-- 결과 {result: released} | {result: denied, reason}.
-- 거부 사유: not_opened(몫의 연 줄이 아님·없음) · already_released(b) · not_latest·not_requester(c) · not_inspected(d) · release_limit_reached(e).
create function public.revgift_release_print(p_log_id bigint, p_requester uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_log public.revgift_decrypt_log;
  v_qr text;
  v public.office_parcels;
  v_reason text;
begin
  if p_log_id is null or p_requester is null then
    raise exception '돌려줄 줄과 요청자가 있어야 한다' using errcode = '22023';
  end if;
  -- 기록 줄은 고칠 수 없으므로 잠그기 전에 읽어도 바뀌지 않는다
  select * into v_log from public.revgift_decrypt_log where id = p_log_id;
  if v_log.id is null or v_log.result <> 'opened' then
    return jsonb_build_object('result', 'denied', 'reason', 'not_opened');
  end if;
  select p.qr_code into v_qr from public.office_parcels p where p.share_id = v_log.share_id;
  if v_qr is null then
    return jsonb_build_object('result', 'denied', 'reason', 'not_opened');
  end if;
  -- 잠금 순서는 봉투를 내주는 함수와 같다 — 상자 다음 몫
  v := public.office_lock_qr(v_qr);
  perform 1 from public.revgift_shares s where s.id = v.share_id for update;
  if exists (select 1 from public.revgift_decrypt_releases x where x.opened_log_id = v_log.id) then
    v_reason := 'already_released';                                                                  -- (b)
  elsif v_log.id <> (select max(l.id) from public.revgift_decrypt_log l where l.share_id = v.share_id and l.result = 'opened') then
    v_reason := 'not_latest';                                                                        -- (c)
  elsif v_log.requester_id <> p_requester then
    v_reason := 'not_requester';                                                                     -- (c)
  elsif v.state <> 'inspected' then
    v_reason := 'not_inspected';                                                                     -- (d)
  elsif (select count(*) from public.revgift_decrypt_releases x where x.share_id = v.share_id) >= 2 then
    v_reason := 'release_limit_reached';                                                             -- (e)
  end if;
  if v_reason is not null then
    return jsonb_build_object('result', 'denied', 'reason', v_reason);
  end if;
  insert into public.revgift_decrypt_releases (opened_log_id, share_id, requester_id) values (v_log.id, v.share_id, p_requester);
  return jsonb_build_object('result', 'released');
end $$;

revoke all on function public.revgift_print_context(text) from public, anon, authenticated, service_role;
revoke all on function public.revgift_finish_print(text, text) from public, anon, authenticated, service_role;
revoke all on function public.revgift_release_print(bigint, uuid) from public, anon, authenticated, service_role;
grant execute on function public.revgift_print_context(text) to address_decryptor;
grant execute on function public.revgift_finish_print(text, text) to address_decryptor;
grant execute on function public.revgift_release_print(bigint, uuid) to address_decryptor;

-- 게이트웨이가 새 함수를 알게 한다
notify pgrst, 'reload schema';
