-- ═════════════════════════════════════════════════════════════════════════
-- 0018 — 모임 일정의 조회 범위 (INV-Z17)
-- ═════════════════════════════════════════════════════════════════════════
--
-- 근거 스펙: docs/specs/write-authorization.md (INV-Z17)
--
-- **0017 은 쓰기만 좁혔다.** 요일·시간 행의 삽입·삭제는 「호스트이고 안 지워졌을 때」로
-- 갔는데 조회는 `using (true)` 그대로였다. 그래서 스터디 조회 정책이 호스트 밖으로
-- 안 내보내는 지워진 스터디의 요일·시간이 비로그인에게도 통째로 나왔다.
--
-- **딸린 것은 딸린 곳의 판정을 따른다.** 「볼 수 있는가」의 주인은 스터디 쪽이고
-- (`private.study_is_visible` = 안 지워졌거나 내가 호스트), 모집글 조회 정책이
-- `posts_read` 에서 이미 같은 함수를 부른다(0010). 이 표만 예외였다.
--
-- **화면에서 사라지는 것은 없다.** 이 표를 읽는 자리는 넷인데 전부 부모(스터디·모집글)에
-- 딸려서 읽으므로, 부모가 안 보이면 그 자리는 원래 아무것도 안 그렸다 —
-- `post-query.ts` · `read-post-detail.ts` · `read-study-detail.ts` · `read-study-for-edit.ts`.
-- 홈의 주간 플래너(`read-my-schedule.ts`)는 로그인한 사람의 내 스터디만 읽는다.

drop policy if exists sessions_read on public.study_sessions;
create policy sessions_read on public.study_sessions for select
  using (private.study_is_visible(study_id, (select auth.uid())));

comment on policy sessions_read on public.study_sessions is
  'INV-Z17 — 요일·시간은 그 스터디를 볼 수 있는 사람에게만 보인다. 판정은 스터디 쪽 것을 그대로 부른다.';
