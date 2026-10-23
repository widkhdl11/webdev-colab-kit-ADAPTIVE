-- 팬꾹 밖에서 직접 돌려준 환불을 「직접 환불함」으로 완료로 적기 (2026-10-24, 카드 d126 사용자 「수정안으로」).
-- 스펙: docs/specs/admin-console.md INV-K7 (S7d·S7e). 근거: workspace/spec-additions-2026-10-24-d126.md
--
-- 왜
--   결제사 취소가 실패한 환불은 처음 누른 지 14일이 지나면 다시 시도할 수 없고(P0025), 대표가 결제사 관리 화면에서 취소하거나 계좌로 돌려줘도
--   기록은 「실패」로 남았다. 환불이 완료되지 않은 회원은 탈퇴되지 않으므로(my-account INV-A15) 그 회원은 영영 탈퇴되지 않았다.
--
-- 무엇을
--   1) 환불 기록에 메모·적은 사람·적은 시각 칸. 셋은 함께 있고, 있으면 완료 기록이다.
--   2) admin_mark_refund_manual(종류, 단위, 메모) — 대표만. 실패한 기록, 또는 누른 지 2분이 지난 처리 중 기록만 완료로 적는다.
--      메모는 앞뒤 빈칸을 빼고 1~200자, 숫자가 10자리 이상 이어지면 받지 않는다 — 연락처·계좌번호를 남기지 않는다(refund_memo_has_long_number).
--      빈칸·점·하이픈·괄호가 셋까지 끼어도 이어진 것으로 세고 전각 숫자도 센다. 앞뒤에 숫자가 붙지 않은 날짜(2026-10-24)·시각(13:05)은 빼고 센다(보안·코드 리뷰).
--      결제사를 부르지 않는다. 잠그는 순서는 admin_claim_refund 와 같다(결제 줄 또는 몫·보내기 → 환불 기록) — 「다시 시도」와 동시에 와도 하나만 된다.
--      금액은 기록의 금액 그대로 돌려준다. 완료로 적은 기록을 고치거나 되돌리는 함수는 없다.
-- 개인정보 구역(pii)은 건드리지 않는다.

alter table public.refunds
  add column if not exists manual_memo text,
  add column if not exists manual_by uuid references public.profiles(id),
  add column if not exists manual_at timestamptz;

alter table public.refunds drop constraint if exists refunds_manual_whole;
alter table public.refunds add constraint refunds_manual_whole check (
  (manual_memo is null) = (manual_by is null) and (manual_by is null) = (manual_at is null)
  and (manual_at is null or status = 'done')
);
-- 메모에 연락처·계좌번호처럼 긴 숫자가 있나 (재리뷰 반영)
--   ① 전각 숫자를 반각으로
--   ② 앞뒤에 숫자가 붙지 않은 날짜(19xx·20xx 년, 1~12 월, 1~31 일)와 시각(0~23 시 : 00~59 분)만 글자로 바꾼다 —
--      계좌번호 안의 「날짜처럼 생긴」 조각(3333-01-23 · 3456-12-12)은 앞뒤에 숫자가 붙어 있거나 범위를 벗어나 그대로 남는다
--   ③ 빈칸·점·하이픈·괄호가 셋까지 끼어도 숫자가 이어진 것으로 센다. 쉼표·빗금·글자는 끊는다(승인번호, 금액 처럼 적는 메모)
create or replace function public.refund_memo_has_long_number(p_memo text)
returns boolean
language sql immutable set search_path = ''
as $$
  select regexp_replace(
           regexp_replace(translate(p_memo, '０１２３４５６７８９', '0123456789'),
                          '(?<![0-9])(19|20)[0-9]{2}[-./](0?[1-9]|1[0-2])[-./](0?[1-9]|[12][0-9]|3[01])(?![0-9])', 'D', 'g'),
           '(?<![0-9])([01]?[0-9]|2[0-3]):[0-5][0-9](?![0-9])', 'T', 'g')
         ~ '[0-9]([ .()-]{0,3}[0-9]){9,}';
$$;
revoke all on function public.refund_memo_has_long_number(text) from public, anon, authenticated;

alter table public.refunds drop constraint if exists refunds_manual_memo_check;
alter table public.refunds add constraint refunds_manual_memo_check check (
  manual_memo is null or (char_length(manual_memo) between 1 and 200 and not public.refund_memo_has_long_number(manual_memo))
);

create or replace function public.admin_mark_refund_manual(p_kind text, p_unit_id uuid, p_memo text)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_memo text := btrim(coalesce(p_memo, ''));
  v_refund public.refunds;
begin
  if not public.is_owner() then
    raise exception '직접 환불 완료는 대표만 적는다' using errcode = '42501';
  end if;
  if char_length(v_memo) not between 1 and 200 then
    raise exception '메모는 1~200자' using errcode = 'P0026';
  end if;
  -- 숫자 10자리 이상 — 휴대폰·계좌번호(날짜·시각은 빼고 센다)
  if public.refund_memo_has_long_number(v_memo) then
    raise exception '메모에 연락처·계좌번호를 쓰지 않는다' using errcode = 'P0027';
  end if;

  -- admin_claim_refund 와 같은 순서로 잠근다
  if p_kind = 'gift' then
    perform 1 from public.payments p where p.id = p_unit_id for update;
    if not found then
      raise exception '결제를 찾을 수 없다' using errcode = 'P0002';
    end if;
    select * into v_refund from public.refunds r where r.payment_id = p_unit_id and r.box_id is null for update;
  elsif p_kind = 'gift_box' then
    perform 1 from public.boxes b join public.payments p on p.order_id = b.order_id and p.kind = 'initial'
    where b.id = p_unit_id for update of p;
    if not found then
      raise exception '상자를 찾을 수 없다' using errcode = 'P0002';
    end if;
    select * into v_refund from public.refunds r where r.box_id = p_unit_id for update;
  elsif p_kind = 'revgift' then
    perform 1 from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
    where s.id = p_unit_id for update of s, d;
    if not found then
      raise exception '몫을 찾을 수 없다' using errcode = 'P0002';
    end if;
    select * into v_refund from public.refunds r where r.share_id = p_unit_id for update;
  else
    raise exception '환불 종류는 gift · gift_box · revgift' using errcode = '22023';
  end if;

  if v_refund.id is null then
    raise exception '아직 환불을 누르지 않았다 — 결제사 취소부터 해 본다' using errcode = 'P0022';
  end if;
  if v_refund.status = 'done' then
    raise exception '이미 환불했다' using errcode = 'P0023';
  end if;
  if v_refund.status = 'requesting' and v_refund.claimed_at > now() - interval '2 minutes' then
    raise exception '환불을 처리하고 있다' using errcode = 'P0024';
  end if;

  update public.refunds r
  set status = 'done', settled_at = now(), manual_memo = v_memo, manual_by = auth.uid(), manual_at = now()
  where r.id = v_refund.id;
  return v_refund.amount_krw;
end
$$;
revoke all on function public.admin_mark_refund_manual(text, uuid, text) from public, anon;
grant execute on function public.admin_mark_refund_manual(text, uuid, text) to authenticated;

notify pgrst, 'reload schema';
