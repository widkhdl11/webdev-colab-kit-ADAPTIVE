-- ═════════════════════════════════════════════════════════════════════════
-- 0020 — 스터디 제목의 모양 규칙을 데이터베이스로 내린다
-- ═════════════════════════════════════════════════════════════════════════
--
-- 근거: docs/design/design-rules.md 「남이 쓴 글자와 제품이 쓴 글자」 ·
--       docs/specs/notifications.md (INV-N6)
--
-- **60자는 지금까지 앱에만 있었다** (`src/entities/study/model/limits.ts` 의 TITLE_MAX).
-- `title` 은 열 단위 갱신 권한 목록에 들어 있어서(0002) 호스트는 **공개 키로 직접 붙어**
-- 폼을 거치지 않고 제목을 바꿀 수 있다. 규칙을 지키는 자리가 값이 들어오는 자리와 같아야
-- 한다 — 0010 이 이름 길이를, 0015 가 이름의 제어문자를 내린 것과 같은 이유다.
--
-- **왜 지금인가**: 과한 제목은 지금까지 자기 스터디 화면에만 나왔다. 참가 사건에 붙은
-- 트리거가 그때의 제목을 알림 행으로 복사하면서, **제목이 다른 사람의 헤더로 옮겨 가는
-- 첫 경로가 생겼다.** 알림 문장은 `「제목」 + 제품이 쓴 꼬리말` 이라, 제목이 길면 화면에
-- 보이는 것이 사실상 호스트가 쓴 문단 하나가 된다 (2026-09-08 security-reviewer).
--
-- **자르는 것은 알림 쪽 일이 아니다.** 알림은 저장된 값 그대로를 그리는 것이 계약이고
-- (INV-N6), 화면에서 잘라 그리면 「그때 이런 일이 있었다」는 기록이 화면마다 달라진다.
-- 그래서 고치는 자리가 원본이다.
--
-- 여기서 거는 것은 셋이다.
--   ① 길이 60 이하 — 앱의 TITLE_MAX 와 같은 숫자
--   ② 공백을 뺀 내용이 있을 것 — `char_length` 만 보면 `'   '` 는 3자라 통과한다. 폼은
--      `formText` 가 다듬어서 못 만들지만, 이 파일이 막으려는 것이 **폼을 안 지나는
--      경로**다 (2026-09-09 code-reviewer · test-auditor).
--      **하한(1자)을 따로 안 적는다** — `btrim(title) <> ''` 가 빈 문자열까지 덮으므로
--      `between 1 and` 로 쓰면 아무것도 안 하는 조건이 하나 붙는다. 변이 검증에서 그
--      조건만 떼도 아무 검사가 안 깨져서 드러났다
--   ③ 제어문자 금지 — 0015 가 사용자 이름에 세운 규칙과 같다. 결합문자·서식문자까지
--      막지는 않는다(그쪽은 길이 제한이 받친다)
--
-- **아래 문장들이 기존 행에서 멈출 수 있다.** 실패 방향은 안전하지만, 급할 때 잘못된
-- 판단(제약을 빼고 다시 돌린다)을 부른다. 먼저 두 자리를 다 세어 본다 —
-- **원본만 세면 안 된다. 이미 복사돼 나간 알림 행은 원본을 고쳐도 안 바뀐다:**
--
--   select count(*) from public.studies
--    where char_length(title) > 60
--       or btrim(title) = '' or title ~ '[[:cntrl:]]';
--
--   select count(*) from public.notifications
--    where char_length(title) not between 1 and 60;
--
-- 0 이 아니면 정정을 손으로 한 번 돌린다 — 데이터 정정은 이 파일에 넣지 않는다.

alter table public.studies drop constraint if exists studies_title_length;
alter table public.studies add constraint studies_title_length
  check (char_length(title) <= 60 and btrim(title) <> '');

alter table public.studies drop constraint if exists studies_title_no_control;
alter table public.studies add constraint studies_title_no_control
  check (title !~ '[[:cntrl:]]');

comment on constraint studies_title_length on public.studies is
  '스터디 이름은 공백을 뺀 내용이 있고 60자 이하다. 개설·수정 폼(entities/study/model/limits.ts 의 TITLE_MAX)과 '
  '같은 값이다. 이 값이 알림 행으로 복사돼 다른 사람의 화면에 나가므로, 폼을 거치지 않는 갱신도 같은 상한을 받는다.';

comment on constraint studies_title_no_control on public.studies is
  '제어문자는 이름에 못 들어간다. 0015 가 사용자 이름에 세운 규칙과 같은 것이고, 근거도 같다 — '
  '값이 들어오는 자리가 규칙을 지키는 자리여야 한다.';

-- **알림 행의 제목에도 같은 상한을 건다.** 알림의 `title` 은 사건 시점의 사본이라(0002 의
-- 트리거) 원본 제약만으로는 이미 복사된 행이 안 덮인다. 원본이 묶인 뒤로 트리거가 넣는
-- 값은 언제나 60자 이하이므로, 이 제약이 새로 막는 것은 **없다** — 대신 이 마이그레이션이
-- 올라가는 순간 옛 행이 남아 있으면 여기서 서고, 그것이 원하는 신호다.
-- 여기를 통과한 뒤에는 트리거가 이 제약에 걸릴 경로가 없다(원본이 이미 좁다).
alter table public.notifications drop constraint if exists notifications_title_length;
alter table public.notifications add constraint notifications_title_length
  check (char_length(title) between 1 and 60);

comment on constraint notifications_title_length on public.notifications is
  '알림에 실린 제목도 스터디 제목과 같은 상한을 받는다. 이 값은 사건 시점의 사본이라 원본을 고쳐도 '
  '안 바뀌고, 패널은 저장된 값을 자르지 않고 그린다(INV-N6).';
