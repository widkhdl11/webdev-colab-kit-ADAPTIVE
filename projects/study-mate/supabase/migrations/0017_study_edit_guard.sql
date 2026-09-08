-- ═════════════════════════════════════════════════════════════════════════
-- 0017 — 스터디 수정의 경계 (INV-Z15 · INV-Z16)
-- ═════════════════════════════════════════════════════════════════════════
--
-- 근거 스펙: docs/specs/write-authorization.md (INV-Z15 · INV-Z16)
--
-- **INV-Z15 는 이미 지켜지고 있었다.** `studies_update_host` 가 처음부터 호스트를 양쪽으로
-- 요구했고, 열 단위 갱신 권한 목록(`0002`)에 `host_id` 가 없어서 스터디를 남에게 넘기는
-- 갱신은 정책을 보기도 전에 떨어진다. 이 파일이 그 자리를 바꾸지는 않는다 —
-- 계약이 그것을 이제 적었을 뿐이고, 검사가 이제 그것을 붙든다.
--
-- **INV-Z16 이 이 파일이 실제로 닫는 구멍이다.** 지워진 것으로 표시된 스터디를 호스트가
-- 계속 고칠 수 있었고, `deleted_at` 이 갱신 가능한 열이라 **되살릴** 수도 있었다.
-- 요일·시간 쪽은 더 넓게 열려 있었다 — 두 정책이 `private.is_study_host` 만 부르는데
-- 그 함수는 삭제 표시를 아예 안 본다(0014 가 모집글 삽입에서 닫은 것과 같은 모양의 빈칸).
--
-- **`with check` 에는 「안 지워졌을 것」을 넣지 않는다.** 삭제는 행을 없애는 것이 아니라
-- `deleted_at` 을 채우는 갱신이고(INV-Z6), `with check` 는 **바뀐 뒤의 행**을 본다.
-- 거기 넣으면 삭제 자신이 거부된다. `using` 은 바뀌기 전의 행을 보므로 삭제는 통과하고,
-- 이미 지워진 행에 대한 다음 갱신부터 막힌다. 시나리오 S23d 가 이 절반을 붙든다.

-- ── 1. 스터디 행 자신 (INV-Z16) ──────────────────────────────────────────
drop policy if exists studies_update_host on public.studies;
create policy studies_update_host on public.studies for update
  using (host_id = (select auth.uid()) and deleted_at is null)
  with check (host_id = (select auth.uid()));

-- ── 2. 요일·시간 (INV-Z15 · INV-Z16) ─────────────────────────────────────
-- 판정을 하나 새로 둔다. `is_study_host` 에 삭제 표시를 더하지 **않는** 이유는, 그 함수를
-- 부르는 나머지 자리(참여자 조회·참여자 상태 갱신·모집글 삽입·프로필 가시성)가 지워진
-- 스터디에서도 참이어야 하기 때문이다 — 호스트는 자기가 지운 스터디의 참여자 명단과
-- 모집글을 계속 본다(INV-Z11 · `study_is_visible`).
-- 「볼 수 있다」와 「고칠 수 있다」는 다른 판정이고, 한 함수에 둘을 담으면 한쪽이 조용히
-- 넓어지거나 좁아진다.
create or replace function private.study_is_editable(p_study_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $fn$
  select exists (
    select 1 from public.studies s
     where s.id = p_study_id and s.host_id = p_user_id and s.deleted_at is null
  );
$fn$;

-- 새 함수는 기본으로 PUBLIC 이 실행할 수 있다. 그 기본값에 기대면 "누가 부를 수 있는지"가
-- 파일 어디에도 안 적힌다 (0010 과 같은 처리).
revoke all on function private.study_is_editable(uuid, uuid) from public;
grant execute on function private.study_is_editable(uuid, uuid)
  to anon, authenticated, service_role;

drop policy if exists sessions_write_host on public.study_sessions;
create policy sessions_write_host on public.study_sessions for insert
with check (private.study_is_editable(study_id, (select auth.uid())));

drop policy if exists sessions_del_host on public.study_sessions;
create policy sessions_del_host on public.study_sessions for delete
using (private.study_is_editable(study_id, (select auth.uid())));

comment on function private.study_is_editable(uuid, uuid) is
  'INV-Z15·Z16 — 그 사람이 이 스터디를 고칠 수 있는가. 호스트이고 지워지지 않았을 때만 참. 「볼 수 있는가」(study_is_visible)와 다른 판정이다.';
