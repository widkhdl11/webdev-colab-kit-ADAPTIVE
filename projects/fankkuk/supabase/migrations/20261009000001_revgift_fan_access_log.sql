-- 팬 「내 주소 열람 기록」 읽기 (reverse-gift INV-R16: 팬은 자기 몫 주소의 열람 기록을 본다).
--
-- 크리에이터 열람 기록(my_access_log, 20261005000009 · 20261006000004)과 같은 모양을 몫 하나에 대해 만든다.
-- 기록 표 셋의 권한은 그대로 둔다 — 연 줄·거부 줄(revgift_decrypt_log), 돌려줌(revgift_decrypt_releases),
-- 주소를 지운 줄(revgift_address_events) 모두 로그인 키로는 직접 읽지 못하고, 아래 함수로만 읽는다.
--
-- 사람 ID 를 받지 않는다. 몫 번호를 받고, 그 몫의 받는 팬이 로그인 토큰의 계정(auth.uid())일 때만 줄을 돌려준다.
-- 남의 몫·없는 몫은 빈 목록이다(어느 쪽인지 구분하지 않는다). 보낸 크리에이터·직원·대표 운영자도 이 함수로는 0줄이다.
--
-- 돌려주는 칸: 시각 · 종류(opened 연 줄 / denied 거부 줄 / deleted 지운 줄) · 몇 번째 출력 · 거부 사유
--             · 지운 까닭(shipped 출고 / returned 반송 / cancelled 취소) · 요청자 · 돌려받은 줄인지.
-- 요청자는 계정 id·아이디·닉네임 없이 「대표」(owner)인지 아닌지(other)만 — 크리에이터 열람 기록과 같은 판단이다:
-- 복호화 함수는 대표 계정이 아닌 요청을 not_owner 로 거부하고, 그 밖의 줄은 대표 계정의 요청이다(INV-P8).
-- 지운 줄은 사람이 연 것이 아니라 상태가 바뀌며 지워진 것이라 요청자가 없다(null).
-- 돌려받은 줄(released)은 크리에이터 화면과 같이 연 줄에 표시만 한다 — 원래 줄은 그대로 보인다(INV-R13).
-- 주소 값·운송장 번호·요청자 계정 id 는 어느 칸에도 없다(INV-R7·R8).

-- plpgsql 로 쓴다 — 지운 줄 표(revgift_address_events)는 사람이 적용하는 manual/0006 이 만들어서, 새 DB 에 마이그레이션을
-- 전부 다시 적용할 때는 아직 없을 수 있다. language sql 은 만들 때 본문의 표를 찾아 실패하고, plpgsql 은 부를 때 찾는다.
-- 다시 적용해도 결과가 같게 create or replace 로 둔다.
create or replace function public.my_revgift_access_log(p_order_no text)
returns table (
  at timestamptz,
  kind text,
  print_no smallint,
  deny_reason text,
  outcome text,
  requester text,
  released boolean
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with mine as (
    select s.id
    from public.revgift_shares s
    where s.order_no = p_order_no
      and s.fan_id = auth.uid()
  ),
  rows_ as (
    select l.at, l.result as kind, l.print_no, l.deny_reason, null::text as outcome,
           case when l.deny_reason = 'not_owner' then 'other' else 'owner' end as requester,
           exists (select 1 from public.revgift_decrypt_releases r where r.opened_log_id = l.id) as released,
           0 as src, l.id as seq
    from public.revgift_decrypt_log l
    join mine on mine.id = l.share_id
    union all
    select e.at, 'deleted', null::smallint, null::text, e.outcome, null::text, false,
           1, 0::bigint
    from public.revgift_address_events e
    join mine on mine.id = e.share_id
    where e.event = 'deleted'
  )
  -- 같은 시각이면 지운 줄이 위(주소는 마지막에 지워진다), 기록 줄끼리는 나중 줄이 위
  select r.at, r.kind, r.print_no, r.deny_reason, r.outcome, r.requester, r.released
  from rows_ r
  order by r.at desc, r.src desc, r.seq desc;
end $$;

revoke all on function public.my_revgift_access_log(text) from public, anon;
grant execute on function public.my_revgift_access_log(text) to authenticated;

notify pgrst, 'reload schema';
