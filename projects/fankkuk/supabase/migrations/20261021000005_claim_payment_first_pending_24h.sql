-- 결제 확정 시작의 24시간 (payment INV-M22 ④ · INV-M15) — 2026-10-21 보안 리뷰 [낮음] 반영.
-- 그 전: claim_payment 는 「결제 대기인 줄만 승인 중으로」만 봐서, 23시간 59분에 이어 하기 → 24시간 1분에 결제창을 마치면
-- 24시간 닫기(office_run_expiry 0a)가 돌기 전이라 승인 API 가 불리고 주문이 등록됐다.
-- 이제 처음 결제 대기를 만든 때(결제 줄의 created_at — 이어 하기는 이 칸을 바꾸지 않는다, 20261021000004) + 24시간 전일 때만 승인 중이 된다.
-- 조건은 팬 선물 첫 결제 줄(kind = 'initial')에만 걸린다 — 차액은 claim_difference_payment, 역조공은 claim_revgift_payment 가 따로 판정하며 바꾸지 않는다.
-- 24시간이 지난 줄은 결제 대기로 남고(닫기는 지금처럼 자동 처리가 한다), 앱 서버 확정 흐름은 확정 시작에 실패한 뒤 다시 읽어 결제 대기면 「결제 실패」로 안내한다.
-- 나머지는 20261008000015_payment_reconcile.sql 의 정의 그대로(「승인 중」이 된 시각을 적는다). 다시 적용해도 같다.

create or replace function public.claim_payment(p_toss_order_id text)
returns boolean
language sql security definer set search_path = ''
as $$
  with claimed as (
    update public.payments set status = 'confirming', confirming_at = now()
    where toss_order_id = p_toss_order_id and status = 'pending'
      -- 팬 선물 첫 결제 줄만 24시간을 본다. 다른 줄은 지금 그대로(차액·역조공은 각자의 확정 시작 함수가 판정)
      and (kind <> 'initial' or now() < created_at + interval '24 hours')
    returning 1
  )
  select exists (select 1 from claimed);
$$;

revoke all on function public.claim_payment(text) from public, anon, authenticated;
grant execute on function public.claim_payment(text) to service_role;
