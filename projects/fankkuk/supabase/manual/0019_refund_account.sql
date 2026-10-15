-- 무통장 입금 주문의 환불 계좌 (payment INV-M25, 카드 d87 「추천대로」 1번 — 환불은 팬이 환불 계좌를 한 번 입력).
-- 사람이 직접 적용한다(개인정보 구역 표·함수를 만든다). 마이그레이션 20261015000003_virtual_account_flow.sql 다음에 적용한다.
--
-- 적용(로컬, bash):
--   docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/0019_refund_account.sql
-- 확인: npm run test:integration -- payment-va-db
--   → 「(manual/0019 뒤)」 시험 넷이 적용 전에는 실패하고 적용 뒤에는 통과한다.
--
-- 무엇을 만드나
--   1) pii.refund_accounts — 결제 하나에 한 줄. 은행 코드·계좌번호 끝 네 자리(화면·기록에 보여 줄 것)와 봉인값.
--      봉인값은 앱 서버가 서버 비밀 키(REFUND_ACCOUNT_KEY, AES-256-GCM)로 봉인한 {계좌번호, 예금주} — DB 만으로는 열 수 없다.
--   2) set_my_refund_account(주문번호, 은행, 끝 넷, 봉인값) — 로그인 토큰의 팬이 보낸 주문, 무통장으로 입금이 끝난 결제만.
--      남의 주문·없는 주문·카드 결제·입금 전 결제는 같은 거부(P0002). 그 결제의 환불이 「처리 중」이면 바꾸지 않는다(P0024).
--   3) my_refund_account(주문번호) — 은행 코드와 끝 네 자리만.
--   4) refund_account_sealed(환불 기록 ID) — 앱 서버 키만. 「처리 중」인 환불 기록의 결제에 저장된 은행·봉인값.
--   5) 환불 기록이 완료가 되면 그 결제의 환불 계좌를 지운다(줄 지킴이). 실패하면 남아 다시 시도에 쓴다.
--
-- 앱과 DB 가 한쪽만 바뀐 상태
--   DB 만 새것: 옛 앱은 이 함수를 부르지 않는다 — 무통장 결제가 없으니 바뀌는 것이 없다.
--   앱만 새것: 환불 계좌 저장은 함수 없음으로 실패하고(저장 안 됨), 무통장 결제의 환불은 계좌를 읽지 못해 결제사까지 가지 않고 실패로 남는다.
--              카드 결제의 환불은 그대로 된다(무통장인지는 마이그레이션 쪽 refund_is_deposit 이 정한다).
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다.

begin;

-- ── 1) 표 ─────────────────────────────────

create table pii.refund_accounts (
  payment_id uuid primary key references public.payments (id) on delete cascade,
  bank_code text not null check (bank_code ~ '^[0-9A-Z]{2,3}$'),
  account_last4 text not null check (account_last4 ~ '^[0-9]{4}$'),
  -- 「v1.<iv base64>.<암호문 base64>」 — 꼴만 본다
  sealed text not null check (sealed ~ '^v1\.[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]+={0,2}$' and char_length(sealed) <= 1000),
  updated_at timestamptz not null default now()
);
alter table pii.refund_accounts enable row level security;
revoke all on pii.refund_accounts from public, anon, authenticated;

-- ── 2) 팬: 환불 계좌 넣기 ─────────────────────────────────

create function public.set_my_refund_account(p_order_no text, p_bank_code text, p_last4 text, p_sealed text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_payment_id uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  if p_bank_code is null or p_bank_code !~ '^[0-9A-Z]{2,3}$' or p_last4 is null or p_last4 !~ '^[0-9]{4}$'
     or p_sealed is null or p_sealed !~ '^v1\.[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]+={0,2}$' or char_length(p_sealed) > 1000 then
    raise exception '환불 계좌의 꼴이 다르다' using errcode = '22023';
  end if;
  -- 결제 줄을 잠근다 — 환불 잡기(admin_claim_refund)와 차례로 지나가게
  select p.id into v_payment_id
  from public.orders o
  join public.payments p on p.order_id = o.id and p.kind = 'initial' and p.status = 'done' and p.deposit_secret_hash is not null
  where o.order_no = p_order_no and o.fan_id = v_uid
  for update of p;
  if v_payment_id is null then
    raise exception '무통장으로 낸 내 주문이 아니다' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.refunds r where r.payment_id = v_payment_id and r.status = 'requesting') then
    raise exception '환불을 처리하고 있다' using errcode = 'P0024';
  end if;
  insert into pii.refund_accounts (payment_id, bank_code, account_last4, sealed)
  values (v_payment_id, p_bank_code, p_last4, p_sealed)
  on conflict (payment_id) do update
    set bank_code = excluded.bank_code, account_last4 = excluded.account_last4, sealed = excluded.sealed, updated_at = now();
end $$;

-- ── 3) 팬: 넣은 계좌 보기 ─────────────────────────────────

create function public.my_refund_account(p_order_no text)
returns table (bank_code text, account_last4 text)
language sql stable security definer set search_path = ''
as $$
  select a.bank_code, a.account_last4
  from public.orders o
  join public.payments p on p.order_id = o.id and p.kind = 'initial'
  join pii.refund_accounts a on a.payment_id = p.id
  where o.order_no = p_order_no and o.fan_id = auth.uid();
$$;

-- ── 4) 앱 서버: 환불할 때 읽기 ─────────────────────────────────

create function public.refund_account_sealed(p_refund_id uuid)
returns table (bank_code text, sealed text)
language sql stable security definer set search_path = ''
as $$
  select a.bank_code, a.sealed
  from public.refunds r
  join pii.refund_accounts a on a.payment_id = r.payment_id
  where r.id = p_refund_id and r.status = 'requesting';
$$;

-- ── 5) 환불이 끝나면 지운다 ─────────────────────────────────

create function pii.forget_refund_account()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' and new.payment_id is not null then
    delete from pii.refund_accounts a where a.payment_id = new.payment_id;
  end if;
  return null;
end $$;

create trigger refunds_forget_refund_account after update of status on public.refunds
  for each row execute function pii.forget_refund_account();

revoke all on function public.set_my_refund_account(text, text, text, text) from public, anon;
grant execute on function public.set_my_refund_account(text, text, text, text) to authenticated;
revoke all on function public.my_refund_account(text) from public, anon;
grant execute on function public.my_refund_account(text) to authenticated;
revoke all on function public.refund_account_sealed(uuid) from public, anon, authenticated;
grant execute on function public.refund_account_sealed(uuid) to service_role;
revoke all on function pii.forget_refund_account() from public, anon, authenticated;

commit;
