-- ═════════════════════════════════════════════════════════════════════════
-- 0015 — 프로필 수정과 아바타 업로드의 강제 위치 (INV-E3 · E4 · E5)
--
-- 근거 스펙: docs/specs/profile-editing.md
--
-- 셋 다 「아직 아무 화면도 요구하지 않아서 열려 있던」 자리다. `/profile/edit` 가 그
-- 자리들을 처음 쓰는 화면이라, 화면보다 먼저 닫는다.
-- ═════════════════════════════════════════════════════════════════════════


-- ── INV-E3: 아바타는 자기 아이디 폴더 아래에만 ────────────────────────────
--
-- 전에는 정책 넷이 **버킷과 올린 사람만** 봤다. 경로를 안 보므로 아무나
-- `<남의 id>/avatar.png` 를 만들 수 있었고, 화면이 경로 규약으로 주소를 만드는 순간
-- 그 파일이 그 사람의 얼굴로 나간다.
--
-- **더 나쁜 쪽은 그다음이다.** 그렇게 자리를 차지하면 진짜 주인은 자기 폴더에 못 올린다 —
-- 덮어쓰기가 update 라 `owner_id` 가 안 맞아 거부된다. 2026-09-06 에 검사로 실측했다.
--
-- `storage.foldername(name)` 은 경로를 폴더 배열로 자른다(Supabase 가 제공. 이 데이터베이스에
-- 실제로 있는 것을 확인하고 쓴다). 첫 칸이 곧 사용자 폴더다.
--
-- **`owner_id` 판정을 빼지 않는다.** 경로만 보면 폴더 이름이 자기 id 인 한 남이 만든 행도
-- 고칠 수 있게 되는데, 그 상태는 지금은 도달 불가지만 정책 하나가 바뀌면 열린다.
-- 둘 다 요구하는 편이 싸다.

drop policy if exists avatars_read       on storage.objects;
drop policy if exists avatars_write_self on storage.objects;
drop policy if exists avatars_update_own on storage.objects;
drop policy if exists avatars_delete_own on storage.objects;

-- ── 조회 정책은 「목록」만 막는다 ─────────────────────────────────────────
--
-- 사진을 공개로 두는 것은 2026-09-06 사람 결정이다(모집글 상세가 비로그인에게 열려 있고
-- 거기에 작성자 얼굴이 나온다). 그런데 그 결정이 승인한 것은 **주소를 아는 사람이 사진을
-- 보는 것**이지, 명부를 긁을 수 있는 것이 아니었다.
--
-- 버킷이 `public = true` 라 파일 **내려받기**(`/object/public/...`)는 이 정책을 아예 안
-- 지난다. 이 정책이 지배하는 것은 **목록**(`storage.list`)이고, 조건이 없으면 비로그인이
-- 공개 키로 폴더 이름을 전부 받아 갈 수 있다 — 경로 규약이 `<사용자 id>/...` 라
-- **그 목록이 곧 회원 id 명부**이고, id 하나면 얼굴 사진이 따라 나온다.
-- INV-Z13 이 프로필 본문을 「볼 이유가 있는 사람에게만」으로 좁힌 사람들의 얼굴이 통째로 샌다.
--
-- 그래서 목록은 자기 것만 보이게 하고, 사진 주소는 그대로 열어 둔다. 화면이 주소를 만드는
-- 방식(`getPublicUrl`)은 문자열 조립이라 질의를 안 하므로 영향을 안 받는다.
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select
  using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text);

comment on policy avatars_read on storage.objects is
  '목록만 막는다. 공개 버킷이라 파일 내려받기는 이 정책을 안 지나고, 그것은 2026-09-06 사람 결정이다.';

create policy avatars_write_self on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_update_own on storage.objects for update
  using (
    bucket_id = 'avatars'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_delete_own on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

comment on policy avatars_write_self on storage.objects is
  'INV-E3 의 강제 위치. 전에는 경로를 안 봐서 남의 아이디 폴더를 미리 차지할 수 있었다.';


-- ── INV-E4: 이미지만, 정해진 크기까지만 ───────────────────────────────────
--
-- 버킷이 공개라 여기 담긴 것의 주소는 누구나 읽는다. 제한이 없으면 공개 파일 저장소가 된다.
-- 1MB 는 얼굴 사진 한 장에 넉넉하고, 넘는 것은 화면이 아니라 **버킷이** 거부한다 —
-- 화면 쪽 검사는 편의고 강제가 아니다(앱을 우회한 업로드가 같은 자리를 지나야 한다).
update storage.buckets
   set file_size_limit = 1048576,
       allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
 where id = 'avatars';


-- ── INV-E5: 지역은 고정 목록의 값이거나 비어 있다 ─────────────────────────
--
-- 0002 가 스터디의 지역을 고정 목록(`regions`)으로 뽑을 때 프로필 쪽은 안 따라갔다.
-- 그래서 `profiles.region` 은 아무 문자열이나 받는다. 목록 밖 값이 들어가면 그 사람은
-- 지역 필터의 어느 값으로도 안 걸리는데 화면에는 무언가 적혀 있다 — 오류가 아니라
-- "그런 사람이 없다"로 보인다. `/profile/edit` 가 이 칸을 처음 쓰는 화면이다.
--
-- **먼저 목록 밖 값을 비운다.** 지금 이 데이터베이스에는 0건이지만(2026-09-06 확인),
-- 이 마이그레이션이 올라가는 다른 데이터베이스에는 있을 수 있다. 남겨 두면 제약 추가가
-- 통째로 실패해 마이그레이션이 안 올라간다.
update public.profiles p
   set region = null
 where p.region is not null
   and not exists (select 1 from public.regions r where r.id = p.region);

alter table public.profiles drop constraint if exists profiles_region_fkey;
alter table public.profiles
  add constraint profiles_region_fkey
  foreign key (region) references public.regions (id) on delete set null;

comment on constraint profiles_region_fkey on public.profiles is
  'INV-E5 의 강제 위치. 관심분야(interest_category)가 categories 를 가리키는 것과 같은 결이다.';


-- ── `avatar_url` 이 담는 것은 주소가 아니라 경로다 ────────────────────────
--
-- 전체 주소를 담으면 프로젝트 주소가 데이터에 박힌다 — 로컬에서 넣은 행이 다른 환경에서
-- 깨진 그림이 되고, 그 사실이 화면에 나기 전까지 안 보인다. 담는 것은 버킷 안의 경로이고
-- (`<사용자 id>/avatar.png`) 주소는 읽는 쪽이 만든다.
--
-- 이름을 안 바꾸는 이유: 이 칸을 읽는 코드가 이미 몇 군데 있고, 이름을 바꾸면 그 전부를
-- 같은 커밋에서 고쳐야 한다. 대신 여기 적어 이름이 거짓말하지 않게 한다.
comment on column public.profiles.avatar_url is
  '버킷 avatars 안의 경로(<사용자 id>/파일명). 전체 주소가 아니다 — 주소는 읽는 쪽이 만든다.';


-- ── `avatar_url` 도 자기 폴더만 가리킬 수 있다 (INV-E3 의 나머지 절반) ────
--
-- 저장소 정책은 「남의 폴더에 **파일을 올리는** 것」을 막는다. 그런데 스펙이 말한 피해
-- (「화면이 경로 규약으로 주소를 만드는 순간 그 파일이 그 사람의 얼굴로 나간다」)는 파일을
-- 안 올려도 이 칸으로 도달한다 — `profiles_update_own` 은 `id = auth.uid()` 만 보므로
-- 자기 행의 `avatar_url` 에는 아무 문자열이나 넣을 수 있었다.
--
-- 지금은 사진을 그리는 화면이 내 프로필 하나뿐이라 피해가 자기 화면 안에 갇혀 있지만,
-- 모집글 상세에 작성자 사진을 붙이는 순간 남의 얼굴을 자기 얼굴로 걸 수 있게 된다.
-- 앱은 이미 `<사용자 id>/...` 만 쓰므로 이 제약으로 깨지는 경로가 없다.
alter table public.profiles drop constraint if exists profiles_avatar_path_own;
alter table public.profiles add constraint profiles_avatar_path_own
  check (avatar_url is null or avatar_url like id::text || '/%');


-- ── 이름의 제어문자 (값이 들어오는 자리가 하나 늘었다) ────────────────────
--
-- 0010 은 「규칙을 지키는 자리가 값이 들어오는 자리와 같아야 한다」고 적고, 가입 경로의
-- 이름에서 제어문자를 지우는 함수를 두었다. 그 함수는 **가입 트리거와 백필만** 부른다.
-- `/profile/edit` 가 두 번째 입력 경로를 열었으므로 규칙이 따라와야 한다.
--
-- 지우지 않고 **거부한다.** 조용히 지우면 사용자가 적은 것과 저장된 것이 달라지는데
-- 화면은 성공이라고 말한다. 가입 경로는 지우는 쪽이 맞았다 — 거기서 거부하면 가입 자체가
-- 실패하고 사용자는 이유를 못 본다(메타데이터라 화면에 없다).
alter table public.profiles drop constraint if exists profiles_username_no_control;
alter table public.profiles add constraint profiles_username_no_control
  check (username !~ '[[:cntrl:]]');
