-- ═════════════════════════════════════════════════════════════════════════
-- 0021 — 메시지 행에서 무엇을 사람이 정하고 무엇을 데이터베이스가 정하나
-- ═════════════════════════════════════════════════════════════════════════
--
-- 근거: docs/specs/chat-message-integrity.md (INV-M1 ~ INV-M5)
--
-- 삽입 정책(`0010:238-242`)이 보는 것은 `sender_id` 가 나인가와 이 방의 멤버인가
-- 둘뿐이다. **정책의 조건에 없는 열은 요청이 보낸 값 그대로 들어간다.** 0002 의 4절이
-- 갱신에 대해 이미 같은 판정을 내렸는데 삽입 쪽은 그때 안 좁혔다. 그래서 방 멤버는
-- 공개 키로 직접 붙어 `created_at` 을 아무 값으로나 실을 수 있었다.
--
-- 그 값이 가는 곳: 날짜 구분선·시각(`ChatRoomView.tsx:173,199`) · 방 정렬
-- (`read-chats.ts:145`) · 안 읽은 수(`read-chats.ts:132`). 과거 시각이면 남이 이미 나눈
-- 대화 중간에 문장이 끼어들고 `.gt()` 에 안 걸려 안 읽음에도 안 뜬다. 미래 시각이면 그
-- 방이 목록 맨 위에 고정되고 읽어도 배지가 안 꺼진다.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. INV-M1 — 요청이 이름 붙일 수 있는 열은 셋뿐이다
-- ─────────────────────────────────────────────────────────────────────────
-- 열 단위 권한은 정책보다 **앞에서** 판정한다 — 허용되지 않은 열이 요청에 들어오면
-- 정책을 보기도 전에 거부된다. 0002 의 4절이 갱신에 쓴 것과 같은 방식이다.
--
-- `id` 와 `created_at` 이 목록에 없으므로 둘 다 기본값에서만 나온다
-- (`gen_random_uuid()` · `now()`).
--
-- **service_role 은 안 좁힌다.** 좁히면 시드 스크립트와 통합 검사의 준비물 생성이 막힌다
-- (`scripts/seed.mjs` · `tests/integration/helpers.ts` 가 그 키로 붙는다). 그 키는 서버에만
-- 있고 앱 코드에서 부르는 곳이 없다 — `src/` 전체에 `SERVICE_ROLE` 이 0건이다.
--
-- **`anon` 은 아예 못 넣는다.** 정책도 어차피 거부하지만, 권한을 남겨 두면 정책 한 줄을
-- 고치는 변경이 곧바로 「비로그인도 쓸 수 있다」가 된다. 두 층이 다 닫혀 있으면 한 층을
-- 잘못 고쳐도 사고가 안 난다. PUBLIC 에는 이 표의 권한이 없다(2026-09-10 실측:
-- `relacl` 에 grantee 가 빈 항목이 없다).

revoke insert on public.chat_messages from anon, authenticated;
grant insert (chat_id, sender_id, content) on public.chat_messages to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. INV-M3 · INV-M4 — 본문의 모양을 값이 들어오는 자리가 지킨다
-- ─────────────────────────────────────────────────────────────────────────
-- **2000자는 지금까지 앱에만 있었다** (`src/features/chat/model/limits.ts` 의
-- `MESSAGE_MAX`). 그 파일은 스스로 「스키마에 길이 제약이 없어서 서버의 이 값이 유일한
-- 강제 위치」라고 적어 놨는데, 직접 삽입은 그 액션을 지나지 않는다. 0010 이 이름 길이를,
-- 0020 이 스터디 제목을 내린 것과 같은 이유다 — 규칙을 지키는 자리가 값이 들어오는
-- 자리와 같아야 한다.
--
-- 여기서 거는 것은 셋이다.
--   ① 길이 2000 이하 — 앱의 `MESSAGE_MAX` 와 같은 숫자
--   ② 공백을 뺀 내용이 있을 것 — `char_length` 만 보면 `'   '` 는 3자라 통과한다.
--      폼은 `insertMessage` 의 `trim()` 이 막지만, 이 파일이 막으려는 것이 **폼을 안 지나는
--      경로**다. 공백만으로 된 본문은 빈 말풍선이 되고, 그 방의 마지막 메시지 자리를
--      차지해 목록에서 「아직 대화가 없습니다」와 구별되지 않는다.
--      하한(1자)을 따로 안 적는 이유는 0020 과 같다 — 「내용이 있다」가 빈 문자열까지
--      덮으므로 `between 1 and` 로 쓰면 아무것도 안 하는 조건이 하나 붙는다.
--
--      **`btrim` 을 안 쓴다.** 인자 하나짜리 `btrim` 은 U+0020 하나만 자른다 — 0010 이
--      사용자 이름에서 실측해 적어 둔 함정이고(`0010:56-67`), 이 파일도 처음엔 같은 자리에
--      빠졌다(2026-09-10 security-reviewer). 전각 공백(U+3000) 세 칸이나 줄바꿈 없는
--      공백(U+00A0) 하나로 된 본문이 「내용이 있다」를 통과해서 **빈 말풍선이 그대로
--      들어간다.** 폼은 JS `trim()` 이 그 둘을 자르므로 안 걸리고, 즉 뚫리는 것은 이 파일이
--      막으려던 폼 밖 경로뿐이다. 실측(2026-09-10, 로컬):
--      `chr(12288) ~ '[[:space:]]'` 참 · `chr(160)` 참 · `chr(65279)`(BOM) **거짓** —
--      그래서 BOM 은 따로 적는다
--   ③ 제어문자 금지 — 0015(이름) · 0020(제목)과 같은 규칙이다
--
-- **③ 은 줄바꿈도 막는다.** 말풍선은 `white-space: pre-wrap` 으로 그리므로
-- (`src/features/chat/ui/chat-room.module.css:97`) 줄바꿈이 그대로 살고, 2000자를 전부
-- 줄바꿈으로 채우면 말풍선 하나가 화면 수십 개 높이가 된다. 지금 입력창은 한 줄짜리 `<input>` 이라
-- (`ChatRoomView.tsx:214`) 줄바꿈을 만들 수 없다 — 즉 이 제약이 막는 것은 폼이 만들 수
-- 없는 값뿐이고, 폼을 지나는 메시지는 하나도 안 막는다.
-- **여러 줄 입력창으로 바꾸는 날 이 제약을 같이 푼다.** 그때 푸는 것은 줄바꿈과 탭만이고,
-- 나머지 제어문자는 그대로 둔다(2026-09-10 결정).
--
-- **아래 문장이 기존 행에서 멈출 수 있다.** 실패 방향은 안전하지만, 급할 때 잘못된
-- 판단(제약을 빼고 다시 돌린다)을 부른다. 0020 이 정한 절차대로 먼저 세어 본다:
--
--   select count(*) from public.chat_messages
--    where char_length(content) > 2000
--       or regexp_replace(content, '[[:space:]]|' || chr(65279), '', 'g') = ''
--       or content ~ '[[:cntrl:]]';
--
-- 0 이 아니면 정정을 손으로 한 번 돌린다 — 데이터 정정은 이 파일에 넣지 않는다.
-- **메시지에는 사본이 없다.** 0020 은 알림 행까지 같이 세야 했는데(제목이 사건 시점에
-- 복사된다) 본문은 어디로도 복사되지 않는다 — 채팅방 목록의 미리보기는 저장된 값을
-- 그때그때 읽는다(`read-chats.ts:119-126`). 그래서 셀 자리가 여기 하나다.

alter table public.chat_messages drop constraint if exists chat_messages_content_length;
alter table public.chat_messages add constraint chat_messages_content_length
  check (char_length(content) <= 2000
         and regexp_replace(content, '[[:space:]]|' || chr(65279), '', 'g') <> '');

alter table public.chat_messages drop constraint if exists chat_messages_content_no_control;
alter table public.chat_messages add constraint chat_messages_content_no_control
  check (content !~ '[[:cntrl:]]');

comment on constraint chat_messages_content_length on public.chat_messages is
  '메시지 본문은 공백을 뺀 내용이 있고 2000자 이하다. 보내기 폼과 서버 액션이 보는 값'
  '(features/chat/model/limits.ts 의 MESSAGE_MAX)과 같은 숫자다. 이 값은 방 안 화면뿐 아니라 '
  '채팅방 목록의 미리보기 줄로도 나가므로, 폼을 거치지 않는 삽입도 같은 상한을 받는다. '
  '「공백」은 btrim 이 아니라 [[:space:]] 와 BOM 이다 — btrim 은 U+0020 하나만 잘라서 '
  '전각 공백이나 줄바꿈 없는 공백으로만 된 본문을 통과시킨다(0010 이 이름에서 실측했다).';

comment on constraint chat_messages_content_no_control on public.chat_messages is
  '제어문자는 본문에 못 들어간다. 줄바꿈도 여기 포함된다 — 입력창이 한 줄짜리라 폼은 '
  '줄바꿈을 만들 수 없고, 말풍선은 pre-wrap 으로 그려서 직접 넣은 줄바꿈이 그대로 산다. '
  '여러 줄 입력창을 만드는 날 줄바꿈과 탭만 풀고 나머지는 그대로 둔다.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3. INV-M2 — 안 읽은 수를 가르는 두 시각이 같은 시계에서 나온다
-- ─────────────────────────────────────────────────────────────────────────
-- 안 읽은 수는 `created_at > last_read_at` 로 센다(`read-chats.ts:132`). 두 값의 출처가
-- 달랐다 — `created_at` 은 데이터베이스 시계이고 `last_read_at` 은 **앱 서버의 시계**였다
-- (`mark-read.ts` 의 `new Date().toISOString()`). 앱 서버가 데이터베이스보다 빠르면 읽음
-- 시각이 미래로 찍혀 그 차이만큼 뒤에 온 메시지가 영원히 안 읽음으로 안 뜨고, 느리면
-- 이미 읽은 메시지가 다시 올라온다. 둘 다 오류를 안 내고 화면만 틀린 숫자를 그린다.
--
-- 열 단위 갱신 권한(0002 의 4절)은 **어느 열을 바꾸는가**만 정하지 **무슨 값이 들어가는가**는
-- 안 본다. 그래서 값 자체를 데이터베이스가 넣는다.
--
-- **값을 비교하지 않는다.** 「값이 달라졌을 때만 찍는다」로 좁히면 요청이 보낸 값과 저장된
-- 값이 같은 순간에 아무 일도 안 하는 갈래가 생기고, 그 갈래를 지나는 요청은 자기가 보낸
-- 값을 그대로 남긴다. 지금 앱이 보내는 값이 `null` 이고 아직 안 읽은 방의 저장된 값도
-- `null` 이라, 그 갈래는 드문 경우가 아니라 **모든 방의 첫 읽음**이다 — 읽어도 값이 null 로
-- 남아 그 방의 모든 메시지가 영원히 안 읽음으로 보인다.
--
-- **대신 「어느 열을 갱신하는가」로 좁힌다**(`update of last_read_at`). 이건 SET 절에 그 열이
-- 들어왔는지만 보고 값을 비교하지 않으므로 위 갈래가 안 생긴다. 좁히는 이유는 나중에 있다 —
-- 이 표에 열이 하나 붙어 백필을 돌리거나 보수 스크립트가 다른 열을 고치는 순간, 조건이
-- 없으면 **그 방 전원의 읽음 시각이 지금으로 밀린다.** 방향이 「다 읽었다」라서 배지가
-- 조용히 꺼진다 — INV-M2 가 「앱이 빠르면」으로 적어 둔 손해와 같은 모양이다.
-- authenticated 는 어차피 이 열밖에 못 쓰므로(0002 의 4절) 앱 동작은 안 바뀐다.
-- (2026-09-10 security-reviewer)
--
-- 표를 하나도 안 읽으므로 `security definer` 로 두지 않는다 — 부르는 사람의 권한 그대로
-- 돌아도 하는 일이 같다. 검색 경로를 비웠으니 `now()` 도 스키마를 붙여 부른다.
create or replace function public.stamp_chat_read_at() returns trigger
language plpgsql set search_path = '' as $fn$
begin
  new.last_read_at := pg_catalog.now();
  return new;
end;
$fn$;

drop trigger if exists chat_participants_stamp_read on public.chat_participants;
create trigger chat_participants_stamp_read
  before update of last_read_at on public.chat_participants
  for each row execute function public.stamp_chat_read_at();

comment on function public.stamp_chat_read_at() is
  '읽음 시각을 데이터베이스 시계로 찍는다(INV-M2). 안 읽은 수는 chat_messages.created_at 과 '
  '이 값을 비교해서 세므로, 두 값이 다른 시계에서 나오면 오류 없이 틀린 숫자가 나온다. '
  '요청이 보낸 값은 저장되지 않는다.';

-- ─────────────────────────────────────────────────────────────────────────
-- 4. INV-M5 — 저장된 메시지는 수정도 삭제도 안 된다
-- ─────────────────────────────────────────────────────────────────────────
-- **오늘 이것을 지키는 것은 「없음」이다.** `chat_messages` 에 갱신·삭제 정책이 하나도
-- 없어서 이미 거부된다(행 수준 보안이 켜진 표에서 정책이 없는 동작은 전부 거부된다).
--
-- 이 절이 있는 이유는 **지키는 것이 「없음」이라 눈에 안 보이기** 때문이다. 나중에 메시지
-- 수정 기능을 만들면서 정책 한 줄을 더하면 이 규칙이 소리 없이 사라진다. 그때 깨지라고
-- 검사를 두었다(`tests/integration/chat-message-integrity.test.ts` 의 INV-M5).
--
-- **다만 권한은 거둔다.** 처음엔 「정책이 이미 막으니 얻는 것이 없다」로 두려 했는데,
-- 그러면 다음 사람이 여는 문이 자기가 여는 줄 아는 것보다 크다. 지금 `authenticated` 는
-- 이 표에 **통짜 갱신·삭제 권한**을 들고 있다(2026-09-10 실측:
-- `information_schema.column_privileges` 가 다섯 열 전부에 UPDATE 를 준다).
-- 「내 메시지 수정」 정책 한 줄(`for update using (sender_id = auth.uid())`)을 더하는 순간,
-- 같은 요청이 `content` 만이 아니라 `chat_id`(메시지를 남의 방으로 옮긴다) ·
-- `created_at`(이 파일이 방금 닫은 값) · `sender_id`(남이 한 말로 만든다)까지 SET 에 실을
-- 수 있다. 정책의 조건에 없는 열은 요청이 보낸 값 그대로 들어간다 — 이 파일 맨 위에 적은
-- 것과 같은 실패다.
--
-- 아래 한 줄은 **오늘 동작을 하나도 안 바꾼다**(정책이 없어 이미 거부된다). 바꾸는 것은 그
-- 정책을 더하는 날 열리는 문의 크기다. 그때는 열 단위 `grant update (content)` 를 같이
-- 적어야 하고, 그것이 이 표가 삽입에 대해 이미 하고 있는 것과 같은 모양이다.
-- (2026-09-10 security-reviewer)

revoke update, delete on public.chat_messages from anon, authenticated;
