-- 역조공 송장 출력 — 횟수를 올리며 팬 주소 봉투를 내주는 자리. 스펙: docs/specs/reverse-gift.md (INV-R7·R9·R13)
-- 사람이 직접 적용한다(.claude/rules/supabase-fankkuk.md). 마이그레이션 20261006000022_revgift_print.sql(몫 열람 기록·돌려줌 표,
-- 판정 재료·송장 마무리·돌려주기 함수) 다음에 적용한다.
--
-- 적용(로컬, PowerShell — `!` 명령도 PowerShell 로 돈다. PowerShell 에는 `<` 입력 넘기기가 없다):
--   Get-Content projects/fankkuk/supabase/manual/0014_revgift_print.sql -Raw -Encoding utf8 | docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
-- 결과(jsonb): {result: opened, print_no, log_id, order_no, envelope} | {result: denied, reason}
--   · 22023 QR 꼴이 아니거나 역조공 상자가 아님 · P0002 없는 상자
-- 팬 선물의 invoice_claim_print(manual 0010)와 같은 모양이다. 다른 것은 셋이다:
--   · 횟수는 몫마다 센다(몫 전용 기록 표) · 봉투는 pii.revgift_addresses 에서 · 봉투가 없으면(받기 전·이미 지워짐, INV-R9) 거부 줄을 남긴다(INV-R7 a)
-- 봉투와 함께 그 몫의 주문번호를 돌려준다 — 송장 출력 함수가 봉인 속 주문번호와 대조한다(INV-R7 b).
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다.

begin;

-- 마이그레이션 22 가 먼저 적용됐는지 본다. 없으면 여기서 멈춘다(아래 함수는 만들어져도 실행 때마다 실패하기 때문).
do $$
begin
  if to_regclass('public.revgift_decrypt_log') is null or to_regclass('public.revgift_decrypt_releases') is null then
    raise exception '몫 열람 기록 표가 없다 — 마이그레이션 20261006000022_revgift_print.sql 을 먼저 적용한다';
  end if;
end $$;

-- 송장 출력 함수(복호화 전용 역할)만 부른다. 판정(대표·받기·단계·횟수)은 송장 출력 함수가 먼저 했다 —
-- 여기서는 상자·몫을 잠근 자리에서 다시 보고, 열 수 있으면 「연 줄」을 남기며 봉투를 내준다.
-- INV-R7: 횟수 확인과 증가가 이 잠금 안에서 한 번에 일어난다 — 동시 요청 둘이 와도 상한(3)을 넘지 않는다.
-- INV-R13: 횟수 = 이 몫의 연 줄 − 이 몫의 돌려준 줄. 돌려주기 함수도 같은 순서로 잠그므로 세는 동안 돌려줌 줄이 끼어들지 않는다.
create function public.revgift_claim_print(p_qr text, p_requester uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
  v_share public.revgift_shares;
  v_paid boolean;
  v_count integer;
  v_reason text;
  v_address pii.revgift_addresses;
  v_log_id bigint;
begin
  if p_requester is null then
    raise exception '요청자가 없다' using errcode = '22023';
  end if;
  v := public.office_lock_qr(p_qr);
  if v.share_id is null then
    raise exception '역조공 상자가 아니다' using errcode = '22023';
  end if;
  select * into v_share from public.revgift_shares where id = v.share_id for update;
  select d.status = 'done' into v_paid from public.revgift_sends d where d.id = v_share.send_id;

  select (select count(*) from public.revgift_decrypt_log where share_id = v_share.id and result = 'opened')
       - (select count(*) from public.revgift_decrypt_releases where share_id = v_share.id)
    into v_count;

  select * into v_address from pii.revgift_addresses where share_id = v_share.id;

  if v_share.reply <> 'accepted' or v_address.share_id is null then
    v_reason := 'no_valid_approval';                                                                 -- (a) 팬이 받기를 하며 넣은 암호문
  elsif not v_paid or v.state not in ('inspected', 'label_printed') or v_share.inspected_at is null
     or v_share.shipped_at is not null or v_share.returned_at is not null or v_share.cancelled_at is not null
     or not public.office_parcel_shippable(v) then
    v_reason := 'order_not_printable';                                                               -- (c)
  elsif v_count >= 3 then
    v_reason := 'decrypt_limit_reached';
  end if;
  if v_reason is not null then
    insert into public.revgift_decrypt_log (share_id, requester_id, result, deny_reason) values (v_share.id, p_requester, 'denied', v_reason);
    return jsonb_build_object('result', 'denied', 'reason', v_reason);
  end if;

  insert into public.revgift_decrypt_log (share_id, requester_id, result, print_no) values (v_share.id, p_requester, 'opened', v_count + 1)
    returning id into v_log_id;
  return jsonb_build_object('result', 'opened', 'print_no', v_count + 1, 'log_id', v_log_id, 'order_no', v_share.order_no, 'envelope', v_address.envelope);
end $$;

revoke all on function public.revgift_claim_print(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.revgift_claim_print(text, uuid) to address_decryptor;

notify pgrst, 'reload schema';

commit;
