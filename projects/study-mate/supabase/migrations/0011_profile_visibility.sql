-- ═════════════════════════════════════════════════════════════════════════
-- 0011 — 프로필은 볼 이유가 있는 사람에게만 보인다 (INV-Z13)
--
-- `profiles_read` 가 `using (true)` 였다. 뚫린 것이 아니라 **아무 화면도 요구하지 않은
-- 열림**이다 — 화면 목록에 공개 프로필 화면이 없는데, 비로그인이 id 로 하나씩 물어
-- 이름·소개·지역·관심분야를 통째로 가져갈 수 있었다.
--
-- 좁히는 방향을 「로그인한 사람만」으로 잡을 수 없다. 모집글 상세(`/posts/<id>`)는
-- 보호 경로가 아니고(발견은 로그인 앞에 있다), 그 화면이 작성자와 호스트의 프로필을
-- 그린다. 그래서 **읽는 사람과의 관계**로 가른다.
-- ═════════════════════════════════════════════════════════════════════════


-- ── 판정 함수 ────────────────────────────────────────────────────────────
-- private 에 두는 이유는 INV-Z12 그대로다. 여기에 더해 이 함수는 **반드시** definer 여야
-- 한다: 조건이 posts·studies·participants·chat_messages 를 읽는데, invoker 로 두면
-- 그 읽기에 각 표의 정책이 다시 걸린다. participants 의 정책은 다시 판정 함수를 부르므로
-- 정책 안에서 정책이 도는 모양이 된다.
--
-- 네 갈래는 스펙의 INV-Z13 ①②③④ 와 하나씩 짝이다.
create or replace function private.profile_is_visible(p_profile_id uuid, p_viewer_id uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select
    -- ① 본인
    p_profile_id = p_viewer_id

    -- ② 볼 수 있는 스터디의 호스트. 지워진 스터디는 호스트 본인에게만 보이므로
    --    (studies_read 와 같은 정의) 그 정의를 그대로 부른다.
    or exists (
      select 1 from public.studies s
       where s.host_id = p_profile_id
         and private.study_is_visible(s.id, p_viewer_id)
    )

    -- ③ 볼 수 있는 모집글의 작성자. 모집글의 가시성은 그 스터디의 가시성이다(posts_read).
    or exists (
      select 1 from public.posts p
       where p.author_id = p_profile_id
         and private.study_is_visible(p.study_id, p_viewer_id)
    )

    -- ④-1 INV-Z11 이 보여 주기로 정한 참여자 행의 주인.
    --     조건을 새로 쓰지 않고 participants_read 의 식을 그대로 옮겼다 —
    --     두 벌이 되면 한쪽만 고쳐지는 날 프로필이 명단보다 넓어진다.
    or exists (
      select 1 from public.participants pt
       where pt.user_id = p_profile_id
         and (
           pt.user_id = p_viewer_id
           or private.is_study_host(pt.study_id, p_viewer_id)
           or (pt.status = 'accepted' and private.is_study_member(pt.study_id, p_viewer_id))
         )
    )

    -- ④-2 내가 읽을 수 있는 대화에서 **메시지를 보낸 사람**.
    --
    --     처음에는 「같은 채팅방의 구성원」(chat_participants)으로 썼다가 바꿨다. 두 가지가
    --     어긋났다.
    --
    --     · 구성원 조건은 ④-1 이 이미 덮는다. 방 구성원은 전부 그 스터디의 **수락된**
    --       참여자이고(0002 의 sync_study_chat 이 그렇게 유지한다), 호스트도 수락된
    --       참여자 행을 갖는다(0001 의 setup_new_study). 그래서 같은 방 사람끼리는
    --       ④-1 로 이미 서로 보인다 — 도달 가능한 상태가 없는 갈래였다.
    --     · 정작 필요한 자리를 덮지 못한다. **강퇴된 사람의 옛 메시지는 방에 남는다**
    --       (0002: "메시지는 그대로 남는다"). 그 사람의 참여 행은 status='kicked' 라
    --       ④-1 이 안 보여 주므로, 남은 멤버의 화면에서 **보낸 사람 이름만 빈칸**이 된다.
    --
    --     화면이 실제로 읽는 것도 구성원이 아니라 보낸 사람이다
    --     (`read-chats.ts` 의 `sender:profiles(username)`). 방 구성원 명부를 그리는
    --     화면은 없다.
    or exists (
      select 1 from public.chat_messages m
       where m.sender_id = p_profile_id
         and private.is_chat_member(m.chat_id, p_viewer_id)
    );
$fn$;

comment on function private.profile_is_visible(uuid, uuid) is
  'INV-Z13 의 판정. 네 갈래는 스펙의 ①②③④ 와 짝이고, ④-1 은 participants_read 의 식과 같은 문장이어야 한다.';

-- 실행 권한을 명시한다(0010 과 같은 이유 — 기본값에 기대면 누가 부를 수 있는지가
-- 파일 어디에도 안 적힌다). 비로그인도 부를 수 있어야 한다: 공개 모집글 상세가 anon 으로 읽는다.
revoke all on function private.profile_is_visible(uuid, uuid) from public;
grant execute on function private.profile_is_visible(uuid, uuid) to anon, authenticated, service_role;


-- ── 조회 정책 ────────────────────────────────────────────────────────────
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select
using (private.profile_is_visible(id, (select auth.uid())));

comment on policy profiles_read on public.profiles is
  'INV-Z13 의 강제 위치. 전에는 using (true) 였다 — 회원 명부 전체가 비로그인에게 열려 있었다.';
