-- ═════════════════════════════════════════════════════════════════════════
-- 0022 — 사람이 쓴 글자가 제 자리에 머문다
-- ═════════════════════════════════════════════════════════════════════════
--
-- 근거: docs/specs/text-display-integrity.md (INV-T1 · INV-T2)
--
-- 한 사람이 쓴 글자가 다른 사람의 화면에 나가는 자리는 넷이다 — 사용자 이름 · 스터디 제목 ·
-- 채팅 본문 · 알림에 복사된 제목. 네 자리는 전부 **제품이 쓴 글자 옆에** 놓인다.
-- 지금까지 세운 제약(길이 · 제어문자 · 공백)은 열마다 따로 정해져서, 같은 종류의 값이
-- 열마다 다르게 처리됐다. 여기서 그 판정을 한 집합으로 모은다.
--
-- **목록으로 정하지 않고 쟀다**(2026-09-11, 스펙의 「근거」 절에 숫자가 있다). 직전 사이클에서
-- 줄 구분자를 「강제 줄바꿈이니까」로 막았다가 측정에 근거가 뒤집혀 되돌린 적이 있다.
--
-- ─────────────────────────────────────────────────────────────────────────
-- 거는 것 둘
-- ─────────────────────────────────────────────────────────────────────────
--
-- ① **보이는 내용이 하나는 있어야 한다** (`*_visible`)
--
--    지우는 집합은 **잉크가 없거나 빈 칸으로 그려지는 글자 전부**다. 지우고 나서 남는 것이
--    없으면 거부한다. 목록은 2026-09-11 에 Chromium 에서 폭을 재서 정했다:
--
--      `[[:space:]]` · U+00A0 · U+2007 · U+202F (아래 「로케일」 참고)
--      U+061C · U+180E · U+200B–200D · U+2060–2064 · U+FEFF · U+E0000–E007F  (폭 0px)
--      U+115F · U+1160 · U+2800 · U+3164 · U+FFA0                            (빈 칸, 폭 7~14px)
--
--    **U+3164(한글 채움)가 이 목록에서 제일 중요하다** — 폭이 14px 로 U+3000 과 똑같고,
--    한국 서비스에서 「빈 닉네임」을 만드는 데 가장 흔히 쓰이는 글자다. 앞선 판정 어디에도
--    안 걸렸다(공백도 아니고 서식 문자도 아닌 Lo 다).
--
--    **U+FFF9–FFFB 는 뺐다** — 재 보니 폭 9.3px 에 **글리프가 그려진다**(빈 칸이 아니다).
--    이 불변식이 이름 붙인 손해를 안 낸다.
--
--    **`btrim` 으로 쓰지 않는다.** 인자 하나짜리 `btrim` 은 U+0020 하나만 자른다 —
--    0010 이 이름에서 실측해 적어 뒀고 0021 이 본문에서 고친 함정인데, 제목(0020)에는
--    그대로 남아 있었다. 전각 공백 한 자짜리 제목이 통과한다.
--
--    **U+180E 를 따로 적는 이유**: 유니코드 6.3 에서 공백 부류(Zs)에서 서식 부류(Cf)로
--    옮겨 가서 이 Postgres 의 `[[:space:]]` 에 안 걸린다. U+FEFF 도 같은 사정이라
--    0021 이 이미 따로 적어 뒀다.
--
--    **로케일 — U+00A0·U+2007·U+202F 를 `[[:space:]]` 에 안 맡긴다.** POSIX 문자 부류가
--    무엇을 담는지는 SQL 이 아니라 **그 데이터베이스의 ctype** 이 정한다. 유니코드
--    White_Space 기준이면 셋이 공백이고, glibc 표 기준이면 셋 다 공백이 아니다.
--    지금 로컬에서는 걸리지만(실측) 배포처에서도 걸린다는 근거가 없다 — 그래서 명시한다.
--    둘 다에서 지워지므로 어느 쪽이 참이든 결과가 같다.
--
--    **U+200D(ZWJ)가 이 집합에 있고 ②에는 없다.** 가족 이모지가 ZWJ 로 이어 붙인
--    글자라서, 금지하면 정상 메시지가 막힌다. 「지우고 나면 남는 게 있나」쪽에만 넣으면
--    ZWJ 만으로 된 값은 거부되고 이모지 안에 든 ZWJ 는 통과한다.
--
-- ② **양방향 서식 문자는 못 들어온다** (`*_no_bidi`)
--
--    U+061C · U+200E · U+200F · U+202A–U+202E · U+2066–U+2069 — 유니코드가
--    `Bidi_Control=Yes` 로 정한 **열한 자 전부**다.
--
--    **U+061C(아랍 문자 마크)는 빠뜨렸다가 넣었다**(2026-09-11 security-reviewer).
--    그 한 자는 제어문자도 공백도 아니고 원래 지우는 집합에도 없어서, **한 글자로 제약
--    둘을 동시에 지나** 폭 0px 짜리 이름이 됐다. 「부류 전체를 막는다」가 근거인데 부류
--    원소 하나가 빠져 있으면 그 근거가 성립하지 않는다.
--
--    **부류 전체를 막는 근거가 측정에 있다.** 알림 한 줄은 낫표 + 제목 + 낫표 + 제품
--    꼬리말이 한 문단 안에 있는데, 한글 제목으로 재면 시각 순서를 뒤집는 것은 U+202E
--    하나뿐이다. 제목을 히브리어로 바꾸면 U+202B·U+2067·U+2068 도 똑같이 뒤집는다 —
--    **어느 문자가 깨느냐는 그 문자의 성질이 아니라 제목 내용이 정하고, 제목은 쓰는
--    사람이 쓴다.** 「실측에서 깬 것만 막는다」로 갔으면 히브리어 제목 하나로 열리는
--    구멍을 남겼을 것이다.
--
--    **글자의 방향 자체는 안 막는다.** 제어 문자가 없는 아랍어·히브리어 제목은 실측에서
--    경계를 안 깼고 여기서도 통과한다. 막는 것은 주변 글자의 순서를 바꾸는 서식 문자뿐이다.
--
-- ─────────────────────────────────────────────────────────────────────────
-- 기존 제약을 안 뗀다
-- ─────────────────────────────────────────────────────────────────────────
--
-- `studies_title_length` 의 `btrim(...) <> ''` 와 `chat_messages_content_length` 의
-- `regexp_replace([[:space:]]|BOM)` 은 **그대로 둔다.** 둘 다 여기 ①이 보는 집합의
-- 부분집합이라, 남겨 두면 같은 값을 둘이 막을 뿐이고 새는 자리는 안 생긴다.
--
-- 떼지 않는 이유는 그 이름들이 **승인된 스펙의 강제 위치로 박혀 있기** 때문이다
-- (chat-message-integrity.md 의 INV-M3). 이름을 옮기면 그 스펙과 그 스펙을 참조하는
-- 검사를 같이 고쳐야 하고, 그건 이 마이그레이션이 하려는 일이 아니다.
--
-- ─────────────────────────────────────────────────────────────────────────
-- 글자를 `chr()` 로 적는 이유
-- ─────────────────────────────────────────────────────────────────────────
--
-- 이 파일이 다루는 것이 「보이지 않는 글자」다. 정규식 리터럴에 그대로 박으면 diff 에도
-- grep 에도 안 보이고, 파일을 옮기거나 붙여 넣는 과정에 조용히 사라진다 — 사라져도
-- 제약은 만들어지고 아무도 모른다. 레포가 이미 두 번 겪었다(2026-09-06 소스 · 2026-09-09
-- NUL 바이트로 git 이 파일을 바이너리로 읽음). 이번에도 이 사이클의 검사 파일을 쓰다가
-- 실제로 한 번 당했다.
--
-- ─────────────────────────────────────────────────────────────────────────
-- 아래 문장들이 기존 행에서 멈출 수 있다 — 먼저 센다
-- ─────────────────────────────────────────────────────────────────────────
--
-- 실패 방향은 안전하지만, 급할 때 잘못된 판단(제약을 빼고 다시 돌린다)을 부른다.
-- **네 자리를 다 세어야 한다. 원본만 세면 안 된다** — 알림 행은 사건 시점의 사본이라
-- 원본을 고쳐도 안 바뀐다(0020 이 같은 이유로 알림 행을 따로 셌다):
--
--   **아래 두 식은 제약의 다섯 번째·여섯 번째 사본이다.** 제약을 고치면 여기도 같이 고친다 —
--   어긋나면 「0건」을 읽고 돌렸는데 `alter table` 이 중간에 선다.
--
--   with v as (select '[[:space:]]|[' || chr(160) || chr(8199) || chr(8239) || ']|'
--                     || chr(1564) || '|' || chr(6158) || '|[' || chr(8203) || '-' || chr(8205)
--                     || ']|[' || chr(8288) || '-' || chr(8292) || ']|' || chr(10240)
--                     || '|[' || chr(4447) || chr(4448) || chr(12644) || chr(65440) || ']|'
--                     || chr(65279) || '|[' || chr(917504) || '-' || chr(917631) || ']' as strip,
--                     '[' || chr(1564) || chr(8206) || chr(8207) || chr(8234) || '-' || chr(8238)
--                     || chr(8294) || '-' || chr(8297) || ']' as bidi)
--   select 'profiles', count(*) from public.profiles, v
--    where regexp_replace(username, v.strip, '', 'g') = '' or username ~ v.bidi
--   union all select 'studies', count(*) from public.studies, v
--    where regexp_replace(title, v.strip, '', 'g') = '' or title ~ v.bidi
--   union all select 'chat_messages', count(*) from public.chat_messages, v
--    where regexp_replace(content, v.strip, '', 'g') = '' or content ~ v.bidi
--   union all select 'notifications', count(*) from public.notifications, v
--    where regexp_replace(title, v.strip, '', 'g') = '' or title ~ v.bidi;
--
-- 0 이 아니면 정정을 손으로 한 번 돌린다 — 데이터 정정은 이 파일에 넣지 않는다.
-- (2026-09-11 로컬에서 넷 다 0 이었다)

-- ── ① 보이는 내용이 있어야 한다 ─────────────────────────────────────────

alter table public.profiles drop constraint if exists profiles_username_visible;
alter table public.profiles add constraint profiles_username_visible
  check (regexp_replace(username,
           '[[:space:]]'
             || '|[' || chr(160) || chr(8199) || chr(8239) || ']'
             || '|' || chr(1564)
             || '|' || chr(6158)
             || '|[' || chr(8203) || '-' || chr(8205) || ']'
             || '|[' || chr(8288) || '-' || chr(8292) || ']'
             || '|' || chr(10240)
             || '|[' || chr(4447) || chr(4448) || chr(12644) || chr(65440) || ']'
             || '|' || chr(65279)
             || '|[' || chr(917504) || '-' || chr(917631) || ']',
           '', 'g') <> '');

alter table public.studies drop constraint if exists studies_title_visible;
alter table public.studies add constraint studies_title_visible
  check (regexp_replace(title,
           '[[:space:]]'
             || '|[' || chr(160) || chr(8199) || chr(8239) || ']'
             || '|' || chr(1564)
             || '|' || chr(6158)
             || '|[' || chr(8203) || '-' || chr(8205) || ']'
             || '|[' || chr(8288) || '-' || chr(8292) || ']'
             || '|' || chr(10240)
             || '|[' || chr(4447) || chr(4448) || chr(12644) || chr(65440) || ']'
             || '|' || chr(65279)
             || '|[' || chr(917504) || '-' || chr(917631) || ']',
           '', 'g') <> '');

alter table public.chat_messages drop constraint if exists chat_messages_content_visible;
alter table public.chat_messages add constraint chat_messages_content_visible
  check (regexp_replace(content,
           '[[:space:]]'
             || '|[' || chr(160) || chr(8199) || chr(8239) || ']'
             || '|' || chr(1564)
             || '|' || chr(6158)
             || '|[' || chr(8203) || '-' || chr(8205) || ']'
             || '|[' || chr(8288) || '-' || chr(8292) || ']'
             || '|' || chr(10240)
             || '|[' || chr(4447) || chr(4448) || chr(12644) || chr(65440) || ']'
             || '|' || chr(65279)
             || '|[' || chr(917504) || '-' || chr(917631) || ']',
           '', 'g') <> '');

alter table public.notifications drop constraint if exists notifications_title_visible;
alter table public.notifications add constraint notifications_title_visible
  check (regexp_replace(title,
           '[[:space:]]'
             || '|[' || chr(160) || chr(8199) || chr(8239) || ']'
             || '|' || chr(1564)
             || '|' || chr(6158)
             || '|[' || chr(8203) || '-' || chr(8205) || ']'
             || '|[' || chr(8288) || '-' || chr(8292) || ']'
             || '|' || chr(10240)
             || '|[' || chr(4447) || chr(4448) || chr(12644) || chr(65440) || ']'
             || '|' || chr(65279)
             || '|[' || chr(917504) || '-' || chr(917631) || ']',
           '', 'g') <> '');

-- ── ② 양방향 서식 문자 금지 ─────────────────────────────────────────────

alter table public.profiles drop constraint if exists profiles_username_no_bidi;
alter table public.profiles add constraint profiles_username_no_bidi
  check (username !~ ('[' || chr(1564) || chr(8206) || chr(8207) || chr(8234) || '-' || chr(8238)
                       || chr(8294) || '-' || chr(8297) || ']'));

alter table public.studies drop constraint if exists studies_title_no_bidi;
alter table public.studies add constraint studies_title_no_bidi
  check (title !~ ('[' || chr(1564) || chr(8206) || chr(8207) || chr(8234) || '-' || chr(8238)
                       || chr(8294) || '-' || chr(8297) || ']'));

alter table public.chat_messages drop constraint if exists chat_messages_content_no_bidi;
alter table public.chat_messages add constraint chat_messages_content_no_bidi
  check (content !~ ('[' || chr(1564) || chr(8206) || chr(8207) || chr(8234) || '-' || chr(8238)
                       || chr(8294) || '-' || chr(8297) || ']'));

alter table public.notifications drop constraint if exists notifications_title_no_bidi;
alter table public.notifications add constraint notifications_title_no_bidi
  check (title !~ ('[' || chr(1564) || chr(8206) || chr(8207) || chr(8234) || '-' || chr(8238)
                       || chr(8294) || '-' || chr(8297) || ']'));

-- ── 주석 ────────────────────────────────────────────────────────────────

comment on constraint profiles_username_visible on public.profiles is
  'INV-T1 의 강제 위치. 공백류와 폭 없는 글자를 지운 나머지가 있어야 한다. 0015 까지 이름에는 '
  '「비어 있지 않다」 조건이 아예 없어서 줄바꿈 없는 공백 한 글자짜리 이름이 통과했다 — '
  '그런 이름은 멤버 목록에서 폭 0px 로 그려진다(2026-09-11 실측).';

comment on constraint studies_title_visible on public.studies is
  'INV-T1 의 강제 위치. studies_title_length 의 btrim 은 U+0020 만 자르므로 전각 공백 한 자짜리 '
  '제목이 통과했다. 그 제목은 알림 줄에서 「」에 새 참가 신청이 왔습니다가 된다.';

comment on constraint chat_messages_content_visible on public.chat_messages is
  'INV-T1 의 강제 위치. 0021 의 판정은 [[:space:]] 와 BOM 만 봐서 U+200B·U+2060·U+180E·ZWJ 로만 '
  '된 본문을 통과시켰다. 그 본문은 빈 말풍선이 되고, 채팅방 목록의 마지막 메시지 자리를 차지해 '
  '「아직 대화가 없습니다」와 구별되지 않는다.';

comment on constraint notifications_title_visible on public.notifications is
  'INV-T1 의 강제 위치. 알림의 제목은 사건 시점의 사본이라 원본 제약만으로는 안 덮인다. '
  '원본이 이미 좁으므로 트리거가 여기 걸릴 경로는 없고, 이 제약이 막는 것은 사람이 직접 넣는 '
  '경우와 나중에 원본 제약이 느슨해지는 경우다.';

comment on constraint profiles_username_no_bidi on public.profiles is
  'INV-T2 의 강제 위치. 오른쪽-왼쪽 글자가 아니라 주변 글자의 순서를 바꾸는 서식 문자를 막는다 — '
  '아랍어·히브리어 이름은 그대로 통과한다.';

comment on constraint studies_title_no_bidi on public.studies is
  'INV-T2 의 강제 위치. 제목이 한글이면 낫표 경계를 깨는 것은 U+202E 하나뿐이지만, 히브리어 제목이면 '
  'U+202B·U+2067·U+2068 도 깬다(2026-09-11 실측) — 어느 쪽이 올지는 제품이 안 정하므로 부류를 막는다.';

comment on constraint chat_messages_content_no_bidi on public.chat_messages is
  'INV-T2 의 강제 위치. 말풍선 안의 본문도 보낸 사람 이름 줄·시각과 같은 문단 구조 안에 있다.';

comment on constraint notifications_title_no_bidi on public.notifications is
  'INV-T2 의 강제 위치. 사본 쪽이다 — 원본이 좁아진 뒤로 트리거가 여기 걸릴 일은 없지만, '
  '떼면 「지금 이후로」라는 단서 없이 이 표의 제목을 말할 수 없게 된다.';

-- ═════════════════════════════════════════════════════════════════════════
-- 가입 때 이름을 씻는 자리도 같이 넓힌다
-- ═════════════════════════════════════════════════════════════════════════
--
-- **이 부분이 없으면 위 제약들이 가입을 통째로 깬다.** 프로필은 계정 행이 들어오는 그
-- 트랜잭션에서 트리거가 만들므로(0010), 이름이 `profiles` 의 제약에 걸리면 예외가
-- **계정 생성까지 되돌린다.** 사용자가 보는 것은 제약이 낸 영어 원문이고, 무엇을 고쳐야
-- 하는지 알 방법이 없다 — 그리고 다시 눌러도 같은 결과다.
--
-- 0010 이 이 함수를 만들 때 이미 같은 판단을 했다: **이름이 규칙에 걸리면 거절하지 않고
-- 지어 준다.** 거절하면 「계정과 프로필은 함께 생긴다」(INV-A7)를 트리거 자신이 어긴다.
-- 여기서는 그 판단을 새 부류로 넓힐 뿐이다.
--
-- 바뀐 것 셋:
--   ① 지우는 대상에 **양방향 서식 문자**를 더한다. 제어문자와 같은 취급이다 —
--      거절이 아니라 제거다. 이름의 나머지는 살린다(`‮지원` → `지원`).
--   ② 「비었나」 판정을 `nullif(trim(...), '')` 에서 **보이는 내용이 있나**로 바꾼다.
--      폭 없는 공백 한 자짜리 이름은 `trim` 뒤에도 빈 문자열이 아니라서 그대로 통과했다.
--   ③ **자른 뒤에 판정한다.** 앞 25자가 폭 없는 글자이고 뒤에 이름이 오면, 20자로 자른
--      결과에는 보이는 글자가 하나도 안 남는다. 자르기 전에 판정하면 그 경우가 빠져나가
--      제약에 걸리고, 그러면 ①②를 고친 의미가 없다.

create or replace function private.profile_username_from_meta(p_id uuid, p_meta jsonb)
returns text language sql immutable set search_path to '' as $fn$
  with 지운것 as (
    -- ① 못 들어가는 글자를 지운다 — 거절하지 않는다
    select regexp_replace(
             coalesce(p_meta ->> 'username', ''),
             '[[:cntrl:]]|[' || chr(1564) || chr(8206) || chr(8207) || chr(8234) || '-'
               || chr(8238) || chr(8294) || '-' || chr(8297) || ']',
             '', 'g') as v
  ), 다듬은것 as (
    -- 앞뒤 공백을 자른다. 자바스크립트 trim() 이 자르는 것과 같은 집합이 되게
    select regexp_replace(
             v,
             '^([[:space:]]|' || chr(65279) || ')+|([[:space:]]|' || chr(65279) || ')+$',
             '', 'g') as v
      from 지운것
  ), 자른것 as (
    -- ③ 20자로 먼저 자른다. 아래 판정이 **자른 결과**를 봐야 한다
    select left(v, 20) as v from 다듬은것
  )
  select coalesce(
           -- ② 보이는 내용이 남았나 — `profiles_username_visible` 과 같은 집합이다
           nullif(
             case when regexp_replace(
                         v,
                         '[[:space:]]'
                           || '|[' || chr(160) || chr(8199) || chr(8239) || ']'
                           || '|' || chr(1564) || '|' || chr(6158)
                           || '|[' || chr(8203) || '-' || chr(8205) || ']'
                           || '|[' || chr(8288) || '-' || chr(8292) || ']'
                           || '|' || chr(10240)
                           || '|[' || chr(4447) || chr(4448) || chr(12644) || chr(65440) || ']'
                           || '|' || chr(65279)
                           || '|[' || chr(917504) || '-' || chr(917631) || ']',
                         '', 'g') = ''
                  then '' else v end,
             ''),
           '회원' || left(p_id::text, 8)   -- 10자. 위 제약의 20자 안이다
         )
    from 자른것;
$fn$;

comment on function private.profile_username_from_meta(uuid, jsonb) is
  '가입 메타데이터의 이름을 profiles 의 제약 안으로 씻는다. 거절하지 않고 지우거나 지어 주는 이유는 '
  '예외가 계정 생성까지 되돌리기 때문이다(INV-A7). 지우는 집합과 「보이는 내용」 판정은 '
  'profiles_username_no_bidi · profiles_username_visible 과 같아야 한다 — 좁으면 가입이 깨지고, '
  '넓으면 저장할 수 있는 이름을 가입에서만 못 쓴다.';
