-- ═════════════════════════════════════════════════════════════════════════
-- 0004 — INV-Z11: 참여자 명단을 볼 수 있는 사람
--
-- 화면 목록(docs/IA.md)의 `/studies/[id]` 는 "멤버 목록"을 보여주는 곳인데, 지금 정책은
-- **본인과 호스트에게만** 참여자 행을 보여준다. 그래서 승인받은 멤버가 스터디 상세를 열면
-- 자기 한 줄만 보이고 "누구와 하는 스터디인지"를 알 수 없다.
--
-- 넓히되 딱 한 칸만 넓힌다 — 수락된 멤버는 **수락된 행만** 본다.
-- 대기·거절·강퇴 행은 계속 본인과 호스트 밖으로 안 나간다. "누가 신청했다가 거절당했는지"는
-- 그 사람과 호스트 사이의 일이고, 멤버 목록을 보여주자고 같이 열 값이 아니다.
-- ═════════════════════════════════════════════════════════════════════════

-- security definer 인 이유는 is_study_host 와 같다 — 정책 안에서 같은 테이블을 다시 읽으면
-- 정책이 재귀한다.
create or replace function public.is_study_member(p_study_id uuid, p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select exists (
    select 1 from public.participants
     where study_id = p_study_id and user_id = p_user_id and status = 'accepted'
  );
$fn$;

comment on function public.is_study_member(uuid, uuid) is
  'INV-Z11: 그 스터디의 수락된 멤버인가. 참여자 조회 정책이 이 판정으로 멤버 목록을 연다.';

drop policy if exists participants_read on public.participants;
create policy participants_read on public.participants for select
  using (
    user_id = (select auth.uid())
    or public.is_study_host(study_id, (select auth.uid()))
    or (status = 'accepted' and public.is_study_member(study_id, (select auth.uid())))
  );
