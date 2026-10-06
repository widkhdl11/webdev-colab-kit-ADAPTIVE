-- 내 본인 확인 신청 읽기의 줄 순서를 「발급 시각」에서 「그 줄에 마지막으로 일어난 일의 시각」으로 바꾼다.
-- 크리에이터 화면은 맨 위 줄을 「지난 신청」으로 보여 주는데, 발급 순서로 세우면 채널 이사 신청을 거둔 뒤 승인이 취소됐을 때
-- 거둔 신청(나중에 발급)이 위에 와서 취소 사유(채널 사라짐·주인 아님)가 안 보였다(BACKLOG 2026-10-06).
-- 마지막 일: 취소(revoked_at) · 끝남(ended_at — 반려·거둠·닫힘·승인) · 기간 지남(발급 + 게시 기한) · 발급.
-- 기간 지남은 저장된 줄(처리한 시각이 ended_at)이든 읽을 때 계산한 줄이든 「발급 + 게시 기한」으로 센다 — 횟수 세기(cv_failure_count)와 같은 기준.
-- 반환 칸은 20261006000006 과 같다 — 순서만 바뀌므로 앱은 그대로다.

create or replace function public.my_creator_verifications()
returns table (
  id uuid, platform text, channel_url text, code text, method text, status text,
  issued_at timestamptz, post_deadline timestamptz, reason_code text, remaining_count integer
)
language sql stable security definer set search_path = ''
as $$
  select a.id, a.platform, a.channel_url, a.code, public.cv_shown_method(a.id, a.method), public.cv_shown_status(a.status, a.issued_at),
         a.issued_at, case when a.method = 'code' then a.issued_at + public.cv_post_window() end,
         a.reason_code, greatest(0, 3 - public.cv_failure_count(a.account_id, a.platform, a.channel_key))
  from public.creator_verification_applications a
  where a.account_id = auth.uid()
  order by greatest(
             a.issued_at, a.revoked_at,
             case when public.cv_shown_status(a.status, a.issued_at) = 'expired' then a.issued_at + public.cv_post_window() else a.ended_at end
           ) desc,
           a.issued_at desc, a.id;
$$;

revoke all on function public.my_creator_verifications() from public, anon;
grant execute on function public.my_creator_verifications() to authenticated;
