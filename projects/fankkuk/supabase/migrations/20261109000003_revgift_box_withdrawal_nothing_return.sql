-- 선물함 — 2026-11-09 사용자 결정 둘(DECISIONS 마지막 두 줄).
-- ① 선물함에 진행 중인 신청이 있는 팬은 탈퇴되지 않는다(my-account INV-A15 · revgift-box Q17 에서 「팬 탈퇴」를 뺌). 4부(20261109000002)의
--    「탈퇴하면 그 팬의 신청을 끝내고 결제된 줄은 환불 대상」을 거둔다 — 판정에 팬 신청을 더하고, 탈퇴 처리는 신청 받는 중 선물함의 제외 신청만 닫는다.
--    결제 뒤 출고 전에 끝난 줄의 환불(INV-GB21 ②)은 그대로 둔다 — 계정 정지(아직 없음, BACKLOG)가 쓴다. 5년 자동 삭제의 같이 쓰는 표시도 그대로다.
-- ② 모든 신청이 도착 안 함이 된 선물함(INV-GB11)은 명세서 없이 착불 반송 → 반송 확정이면 반송됨(Q12). 사무실 반송 목록에 까닭과 함께 같이 나온다.
-- 개인정보 구역(pii)은 바꾸지 않는다 — 도착 안 함이 된 신청의 사본은 그때 이미 지웠고, 사본이 없는 실측 신청은 명세서 생성이 이미 끝낸다.

-- ── ② 모든 신청이 도착 안 함 → 착불 반송 (INV-GB1 arrived → returning · INV-GB11 · Q12) ──

-- 선물함 줄은 부르는 쪽(명세서 생성)이 잠갔다. 도착 · 실측 중이고 명세서가 없을 때만 — 반송 시작 시각을 적고 6자리를 무효로 한다(Q7).
-- 끝나지 않은 신청은 없다(담길 차례·실측됨이 남았으면 부르지 않는다). 명세서·300원 건수가 없으니 돌려줄 것도 없다.
create or replace function public.revgift_box_start_nothing_return(p_box_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.revgift_boxes
  set status = 'returning', returning_at = now(), code_voided_at = coalesce(code_voided_at, now())
  where id = p_box_id and status = 'arrived' and invoiced_at is null;
end $$;
revoke all on function public.revgift_box_start_nothing_return(uuid) from public, anon, authenticated, service_role;

-- 줄이 하나도 없으면(모두 도착 안 함 등) 명세서를 만들지 않고 착불 반송으로 바꾼다(INV-GB11 · Q12, 2026-11-09 결정) — 사무실에 온 물건
-- (신청 없는 선물·보낼 수 없는 물품)을 한 상자로 크리에이터에게 착불 반송하고, 반송 확정(office_gift_box_confirm_return)이면 반송됨.
-- 실측된 신청이 하나도 없으면 할증 구분을 읽지 않으므로 manual/0033 전에도 반송으로 바뀐다. 6자리는 같은 처리에서 무효(Q7).
-- 20261109000001 본문에 그 두 갈래만 더했다.
create or replace function public.revgift_box_try_invoice(p_box_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_boxes;
  v_rules jsonb := public.revgift_box_rules();
  v_measured uuid[];
  v_lines jsonb;
  v_invoice uuid;
begin
  select * into v from public.revgift_boxes b where b.id = p_box_id for update;
  if v.status is distinct from 'arrived'
     or exists (select 1 from public.revgift_box_holds h where h.box_id = v.id and h.resolved_at is null and h.expired_at is null)
     or exists (select 1 from public.revgift_box_applications a where a.box_id = v.id and a.status = 'selected')
     or ((select count(*) from public.revgift_box_cartons c where c.box_id = v.id) < coalesce(v.carton_count, 1)
         and now() < v.first_received_at + make_interval(hours => (v_rules ->> 'carton_wait_hours')::integer)) then
    return null;
  end if;
  if not exists (select 1 from public.revgift_box_applications a where a.box_id = v.id and a.status = 'measured') then
    perform public.revgift_box_start_nothing_return(v.id);
    return null;
  end if;
  if to_regprocedure('pii.revgift_box_regions(uuid[])') is null then
    return null;
  end if;
  select array_agg(a.id order by a.label_no) into v_measured
  from public.revgift_box_applications a where a.box_id = v.id and a.status = 'measured';
  if v_measured is null then
    return null;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'application_id', a.id, 'tier', a.measured_tier, 'personal_krw', a.personal_krw, 'region', r.surcharge_region) order by a.label_no), '[]'::jsonb)
  into v_lines
  from public.revgift_box_applications a
  join pii.revgift_box_regions(v_measured) r on r.application_id = a.id;
  update public.revgift_box_applications a set status_before_end = a.status, status = 'ended'
  where a.id = any (v_measured) and not exists (select 1 from jsonb_array_elements(v_lines) x where (x ->> 'application_id')::uuid = a.id);
  if jsonb_array_length(v_lines) = 0 then
    perform public.revgift_box_start_nothing_return(v.id);
    return null;
  end if;
  v_invoice := public.revgift_box_write_invoice(v.id, v_lines, now());
  update public.revgift_boxes set status = 'invoiced', invoiced_at = now(), code_voided_at = coalesce(code_voided_at, now()) where id = v.id;
  return v_invoice;
end $$;

-- ── 사무실 반송 목록 (INV-GB19 · Q16 · Q12) ──
create or replace function public.office_gift_box_returns()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_operator() then
    raise exception '운영자만 본다' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', b.id, 'name', b.name, 'creator_name', c.name, 'returning_at', b.returning_at,
      'reason', case when b.invoiced_at is null then 'all_missing' else 'unpaid' end,
      'carton_waybills', coalesce((select jsonb_agg(x.waybill_no order by x.received_at) from public.revgift_box_cartons x where x.box_id = b.id and x.waybill_no is not null), '[]'::jsonb))
      order by b.returning_at)
    from public.revgift_boxes b join public.creators c on c.id = b.creator_id
    where b.status = 'returning'), '[]'::jsonb);
end $$;

revoke all on function public.office_gift_box_returns() from public, anon, service_role;
grant execute on function public.office_gift_box_returns() to authenticated;

-- ── ① 탈퇴 (my-account INV-A15 · 2026-11-09) ──────────────

-- 진행 중인 일 — 20261109000002 본문 그대로에 맨 끝 한 갈래(선물함에 신청한 팬)를 더한다.
create or replace function public.account_has_open_work(p_account uuid, p_creator uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  with my_orders as (
    select o.id from public.orders o where o.fan_id = p_account or (p_creator is not null and o.creator_id = p_creator)
  ), my_shares as (
    select s.id, s.reply, s.shipped_at, s.returned_at, s.cancelled_at, s.disposed_at
    from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
    where (s.fan_id = p_account or (p_creator is not null and d.creator_id = p_creator))
      and d.status <> 'failed'
  )
  select exists (select 1 from my_orders m where not public.order_is_finished(m.id))
    or exists (select 1 from public.office_parcels op join public.boxes b on b.id = op.box_id join my_orders m on m.id = b.order_id
               where op.state not in ('awaiting', 'shipped', 'returned', 'disposed', 'police_handed'))
    or exists (select 1 from public.office_parcels op join my_shares m on m.id = op.share_id
               where op.state not in ('awaiting', 'shipped', 'returned', 'disposed', 'police_handed'))
    or exists (select 1 from my_shares where reply in ('waiting', 'accepted')
               and shipped_at is null and returned_at is null and cancelled_at is null and disposed_at is null)
    or exists (select 1 from public.revgift_sends d where p_creator is not null and d.creator_id = p_creator and d.status in ('pending', 'confirming'))
    -- 돌려줄 환불이 끝나지 않음(INV-A15 S15d): 주문 결제 · 닫힌 상자 · 역조공 몫.
    --   금액 함수를 부르기 전의 조건은 그 함수가 null 을 돌려주는 경우를 미리 거르는 것뿐이다(결과는 같고 줄마다 부르지 않는다)
    or exists (select 1 from public.payments p join my_orders m on m.id = p.order_id join public.orders o on o.id = p.order_id
               where p.status = 'done' and o.shipped_at is null
                 and coalesce(public.refund_due_of_payment(p.id), 0) > 0
                 and not exists (select 1 from public.refunds r where r.payment_id = p.id and r.box_id is null and r.status = 'done'))
    or exists (select 1 from public.boxes b join my_orders m on m.id = b.order_id
               where b.missing_at is not null
                 and coalesce(public.refund_due_of_box(b.id), 0) > 0
                 and not exists (select 1 from public.refunds r where r.box_id = b.id and r.status = 'done'))
    or exists (select 1 from my_shares m
               where m.reply in ('declined', 'expired') and m.shipped_at is null
                 and coalesce(public.refund_due_of_share(m.id), 0) > 0
                 and not exists (select 1 from public.refunds r where r.share_id = m.id and r.status = 'done'))
    -- 6자리를 살려 둔 동안은 환불 금액이 아직 정해지지 않았다 — 닫히면 환불이 생기고, 늦게 오면 사무실에 상자가 생긴다(보안·코드 리뷰 중간)
    or exists (select 1 from public.inbound_codes c join public.boxes b on b.id = c.box_id join my_orders m on m.id = b.order_id
               where c.kept_at is not null and c.state = 'valid')
    or exists (select 1 from public.inbound_codes c join my_shares m on m.id = c.share_id
               where c.kept_at is not null and c.state = 'valid')
    -- 선물함(revgift-box) — 내가 만든 선물함이 끝나지 않았거나(끝 = 완료·반송됨·취소), 그 줄 환불이 끝나지 않았다
    or exists (select 1 from public.revgift_boxes gb where gb.owner_id = p_account and gb.status not in ('done', 'returned', 'cancelled'))
    or exists (select 1 from public.revgift_box_invoice_lines l join public.revgift_box_invoices i on i.id = l.invoice_id
               join public.revgift_boxes gb on gb.id = i.box_id
               where gb.owner_id = p_account and coalesce(public.revgift_box_line_refund_due(l.id), 0) > 0
                 and not exists (select 1 from public.refunds r where r.box_line_id = l.id and r.status = 'done'))
    -- 선물함에 신청한 팬 — 신청한 순간부터 그 선물이 끝날 때까지(2026-11-09 결정). 끝난 신청 = 출고(배송 완료 포함 — 주문의 「출고면 끝」과 같다)·
    --   제외·신청 취소, 또는 선물함이 끝남(완료·반송됨·취소). 그 밖(신청·담길 차례·실측됨·결제됨, 그리고 도착 안 함·끝남이어도 선물함이 아직
    --   반송·발송 중)은 진행 중이다. 제외는 신청 받는 중이면 크리에이터가 되돌릴 수 있어 탈퇴 처리가 같은 처리에서 신청 취소로 닫는다.
    or exists (select 1 from public.revgift_box_applications a join public.revgift_boxes gb on gb.id = a.box_id
               where a.fan_id = p_account
                 and a.status not in ('shipped', 'delivered', 'excluded', 'withdrawn')
                 and gb.status not in ('done', 'returned', 'cancelled'));
$$;
revoke all on function public.account_has_open_work(uuid, uuid) from public, anon, authenticated, service_role;

-- 탈퇴하는 팬의 제외 신청 중 신청 받는 중(open) 선물함의 것만 신청 취소로 닫는다 — 크리에이터가 다시 넣으면 가명 계정의 신청이 살아나기 때문이다.
-- 그 밖의 신청은 판정(account_has_open_work)이 이미 막았거나 끝났다. 선물함 줄 → 신청 줄 순서로 잠근다. 닫은 수를 돌려준다.
create or replace function public.revgift_box_close_excluded_for_withdrawal(p_account uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in select a.id, a.box_id from public.revgift_box_applications a join public.revgift_boxes b on b.id = a.box_id
           where a.fan_id = p_account and a.status = 'excluded' and b.status = 'open' order by a.box_id, a.id loop
    perform 1 from public.revgift_boxes b where b.id = r.box_id for update;
    update public.revgift_box_applications set status = 'withdrawn'
    where id = r.id and status = 'excluded' and exists (select 1 from public.revgift_boxes b where b.id = r.box_id and b.status = 'open');
    if found then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
revoke all on function public.revgift_box_close_excluded_for_withdrawal(uuid) from public, anon, authenticated, service_role;

-- 탈퇴 처리 — 20261109000002 본문 그대로에서 판정 바로 뒤 한 줄만 바꾼다(선물함 신청 끝내기 → 신청 받는 중 선물함의 제외 신청 닫기).
create or replace function public.withdraw_account(p_login_id text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.profiles;
  v_creator public.creators;
  v_pseudonym uuid := gen_random_uuid();
  v_fan_paths text[];
  v_creator_paths text[];
  v_tables regclass[];
  v_tab regclass;
  fk record;
begin
  if not public.is_owner() then
    raise exception '대표만 탈퇴를 처리한다' using errcode = '42501';
  end if;
  select * into v_old from public.profiles p where p.login_id = p_login_id and p.withdrawn_at is null for update;
  if not found or v_old.role not in ('fan', 'creator') then
    raise exception '탈퇴할 수 있는 회원이 아니다' using errcode = 'P0002';
  end if;
  select * into v_creator from public.creators c where c.profile_id = v_old.id for update;
  if public.account_has_open_work(v_old.id, v_creator.id) then
    raise exception '진행 중인 선물·역조공이 있다' using errcode = '55000';
  end if;
  -- 진행 중인 선물함 신청은 위 판정이 막는다(2026-11-09). 남은 것 중 신청 받는 중 선물함의 제외 신청만 신청 취소로 닫는다 — 되돌려 넣지 못하게
  perform public.revgift_box_close_excluded_for_withdrawal(v_old.id);
  if v_creator.id is not null and exists (
    select 1 from public.approval_signatures s join public.approval_requests r on r.request_id = s.request_id
    join public.orders o on o.id = r.order_id where o.creator_id = v_creator.id and s.method <> 'fake' and s.signed_content is not null
  ) then
    -- 카카오 서명 묶음에는 인증서(이름)가 들어 있어 떼는 방법은 카카오 연결 때 정한다(external-connections). 그 전에는 지우지 않고 멈춘다.
    raise exception '카카오 서명 기록의 가명 처리는 아직 없다' using errcode = '0A000';
  end if;

  -- 가명 계정 — 로그인 계정 없음, 닉네임은 「탈퇴한 회원」
  insert into public.profiles (id, login_id, nickname, role, withdrawn_at)
  values (v_pseudonym, 'withdrawn_' || substr(replace(v_pseudonym::text, '-', ''), 1, 16), '탈퇴한 회원', v_old.role, now());
  insert into public.account_withdrawals (pseudonym_id, role, processed_by) values (v_pseudonym, v_old.role, auth.uid());

  -- 개인정보 구역(연락처·주소·주소 암호문과 키·확인 기록) — manual/0025. 없으면 여기서 실패하고 아무것도 남지 않는다.
  perform pii.withdraw_account(v_old.id, v_pseudonym, v_creator.id);

  -- 지울 사진(저장소) — 서버가 이 처리 뒤에 지운다
  v_fan_paths := array_remove(array[v_old.fan_photo_path, v_old.fan_bg_path], null);
  v_creator_paths := array_remove(array[v_creator.photo_path, v_creator.bg_path, v_creator.symbol_path], null);

  -- 계정을 가리키는 칸이 있는 표 전부의 「고치거나 지울 수 없다」 트리거를 잠시 끈다
  select array_agg(distinct c.conrelid) into v_tables
  from pg_constraint c
  where c.contype = 'f' and c.connamespace = 'public'::regnamespace
    and c.confrelid in ('public.profiles'::regclass, 'public.creators'::regclass);
  v_tables := v_tables || array['public.approval_signatures'::regclass];
  foreach v_tab in array v_tables loop
    perform public.withdrawal_toggle_append_only(v_tab, false);
  end loop;

  if v_creator.id is not null then
    -- 서명 기록 — 원문은 해시만 남기고 서명자 식별값·원문을 비운다(INV-S14)
    update public.approval_signatures s
       set content_hash = encode(extensions.digest(convert_to(s.signed_content, 'UTF8'), 'sha256'), 'hex'),
           signed_content = null, signer_id = null
      from public.approval_requests r join public.orders o on o.id = r.order_id
     where r.request_id = s.request_id and o.creator_id = v_creator.id and s.signed_content is not null;

    -- 크리에이터 개인 기록(채널·이름 바꾼 기록·확인 신청·기념일)은 보관 대상이 아니라 지운다
    delete from public.creator_name_changes where creator_id = v_creator.id;
    delete from public.creator_channel_claims where creator_id = v_creator.id;
    delete from public.creator_verification_events where creator_id = v_creator.id;
    delete from public.creator_anniversaries where creator_id = v_creator.id;
    delete from public.creator_verification_unlocks where account_id = v_old.id;
    delete from public.creator_verification_applications where account_id = v_old.id;

    -- 크리에이터 행은 주문이 가리키므로 남기고 비운다. 계정 칸이 비면 「탈퇴한 크리에이터」로 읽힌다(gift-reply).
    perform set_config('fankkuk.verifying', 'on', true);
    update public.creators c
       set profile_id = null, withdrawn_at = now(), name = '탈퇴한 크리에이터', channel = '', channel_title = '', intro = '', alias = '',
           platform = null, channel_url = null, channel_key = null, identity_verified = false, searchable = false,
           x_handle = null, fan_name = null, fan_color = null, birthday_month = null, birthday_day = null,
           photo_path = null, bg_path = null, preview_pick = 'photo', symbol_path = null, symbol_rights_at = null
     where c.id = v_creator.id;
    perform set_config('fankkuk.verifying', '', true);
  end if;

  -- 계정을 가리키는 칸(지우면 함께 지워지는 칸 말고)을 가명 계정으로 옮긴다. 크리에이터 행은 위에서 비웠다.
  for fk in
    select c.conrelid::regclass as tab, a.attname as col
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace and c.confrelid = 'public.profiles'::regclass
      and c.confdeltype <> 'c' and array_length(c.conkey, 1) = 1
      and c.conrelid <> 'public.creators'::regclass and c.conrelid <> 'public.account_withdrawals'::regclass
  loop
    execute format('update %s set %I = $1 where %I = $2', fk.tab, fk.col, fk.col) using v_pseudonym, v_old.id;
  end loop;

  -- 1:1 문의는 3년 보관(INV-A16) — 계정을 지우면 함께 지워지는 칸이라 위 반복이 옮기지 않는다.
  -- 답이 달린 문의를 고치지 못하게 하는 트리거는 이 처리 동안만 끈다(표를 잠그고, 실패하면 함께 되돌아간다).
  alter table public.inquiries disable trigger inquiries_freeze_answered;
  update public.inquiries set author_id = v_pseudonym where author_id = v_old.id;
  alter table public.inquiries enable trigger inquiries_freeze_answered;

  delete from public.profiles where id = v_old.id;
  delete from auth.users where id = v_old.id;

  foreach v_tab in array v_tables loop
    perform public.withdrawal_toggle_append_only(v_tab, true);
  end loop;

  return jsonb_build_object('pseudonym', v_pseudonym, 'fan_photo_paths', to_jsonb(v_fan_paths), 'creator_photo_paths', to_jsonb(v_creator_paths));
end $$;

revoke all on function public.withdraw_account(text) from public, anon;
grant execute on function public.withdraw_account(text) to authenticated;


-- 4부의 「탈퇴 때 신청 끝내기」는 위 탈퇴 처리가 더는 부르지 않는다
drop function if exists public.revgift_box_end_for_withdrawal(uuid);

notify pgrst, 'reload schema';
