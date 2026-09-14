// 변이 검증 도구 — 강제 장치를 하나 무력화하고, 그것을 붙들어야 할 테스트가
// 실제로 빨간불이 되는지 본다. 통과하는 테스트는 그것만으로 검증의 증거가 아니다.
//
// 사용: node scripts/mutate.mjs <변이이름>       변이를 심는다
//       node scripts/mutate.mjs --restore        원래대로 되돌린다(마이그레이션 재적용)
//       node scripts/mutate.mjs --list           변이 목록
//
// 되돌리기는 `supabase db reset --local` 이 아니라 정책·함수를 다시 정의하는 마이그레이션을
// 순서대로 다시 적용하는 것으로 한다(목록은 아래 RESTORE_MIGRATIONS) — 전부
// create or replace / grant / drop if exists 라서 그것만으로 원상 복구된다.

import { Client } from "pg";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// **이 도구는 인가를 일부러 무력화한다.** 손으로 부르는 사용법이 파일 머리에 적혀 있는데,
// 환경에 원격 SUPABASE_DB_URL 이 들어 있으면 그 원격에 「아무나 읽는다」 정책을 심는다.
//
// **문자열 패턴으로는 못 가린다.** 전에는 `@127.0.0.1:` 이 문자열 어디에든 있으면 통과했는데,
// URL 문법에서 호스트를 정하는 것은 **마지막** `@` 뒤다:
//   postgresql://postgres:postgres@127.0.0.1:54322@evil.com/postgres
// 이 값은 옛 검사를 통과하고 실제로는 evil.com 에 붙는다. 그래서 파싱해서 호스트만 본다.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
/**
 * **그리고 `new URL()` 이 읽는 호스트도 진짜 호스트가 아니다.**
 *
 * 실제로 어디에 붙을지 정하는 것은 `pg` 이고, 그 접속 문자열 파서(`pg-connection-string`)는
 * **질의 매개변수를 URL 의 호스트 위에 덮어쓴다.** 설치된 사본에서 실측했다(2026-09-11):
 *
 *   postgresql://postgres:postgres@127.0.0.1:54322/postgres?host=evil.example&port=5432
 *     new URL(...).hostname → "127.0.0.1"     (이 검사를 통과한다)
 *     pg 가 실제로 붙는 곳   → evil.example:5432
 *
 * 위 주석이 「파싱해서 호스트만 본다」로 닫았다고 선언한 구멍과 **같은 부류가 한 칸 아래에
 * 남아 있었다**(2026-09-11 security-reviewer). 그 연결로 이 도구가 보내는 것은
 * `drop policy` · `create policy ... using (true)` · `grant` 처럼 **인가를 일부러 무력화하는
 * 문장들**이다.
 *
 * 그래서 호스트를 정하는 매개변수가 붙어 있으면 그 값이 로컬이든 아니든 **거부한다** —
 * 「질의의 host 도 로컬인지 본다」로 가면 `hostaddr`·중복 키·대소문자마다 같은 판단을
 * 다시 해야 하고, 그 판단은 pg 가 하지 내가 하지 않는다. 나머지 매개변수(`sslmode` 등)는
 * 호스트를 안 바꾸므로 그대로 통과한다.
 */
const HOST_DECIDING_PARAMS = new Set(["host", "hostaddr", "port"]);
/** 비밀번호를 통째로 가린다. 마지막 `@` 앞이 전부 userinfo 다. */
const maskUrl = (u) => u.replace(/\/\/[^/]*@/, "//***@");
function assertLocal(url, what) {
  let host = null;
  let 호스트를바꾸는매개변수 = [];
  try {
    const u = new URL(url);
    host = u.hostname;
    호스트를바꾸는매개변수 = [...u.searchParams.keys()].filter((k) =>
      HOST_DECIDING_PARAMS.has(k.toLowerCase()),
    );
  } catch {
    host = null;
  }
  if (호스트를바꾸는매개변수.length > 0) {
    console.error(
      `이 도구는 정책을 일부러 무력화한다. ${what} 주소에 호스트를 바꾸는 매개변수가 있다` +
        ` (${호스트를바꾸는매개변수.join(", ")}) — 이 값은 URL 의 호스트를 덮어쓴다.` +
        "\n  지금 가리키는 곳: " + maskUrl(url),
    );
    process.exit(1);
  }
  if (host === null || !LOCAL_HOSTS.has(host)) {
    console.error(
      `이 도구는 정책을 일부러 무력화한다. ${what}는 로컬에만 붙인다.` +
        "\n  지금 가리키는 곳: " + maskUrl(url),
    );
    process.exit(1);
  }
}
assertLocal(DB_URL, "데이터베이스");

// ── INV-Z13 판정 함수의 갈래 다섯 ──────────────────────────────────────
//
// 갈래 하나만 빼는 변이가 다섯이다. 본문을 다섯 번 베껴 적는 대신 여기서 조립한다 —
// 베껴 적으면 원본이 바뀔 때 다섯 곳을 다 고쳐야 하고, 하나를 빠뜨리면 그 변이만
// 「낡았다」로 멈춘다(안전한 실패지만 손질이 는다). md5 도 한 자리에만 적는다.
//
// **갈래마다 변이를 따로 두는 이유가 여기서 가장 중요한 부분이다.** 전에는 ②③ 을 함께
// 빼는 변이 하나였다. 그러면 ② 를 붙드는 검사가 빨간불을 내고 판정이 「잡혔다」로
// 나오는데, **③ 만 지우는 diff 는 아무도 안 잡으면서 숫자는 그대로다.** 갈래를 묶으면
// 묶인 것 중 하나만 붙들려도 전부 붙들린 것처럼 보인다.
//
// **그래서 tag 를 손으로 적는다.** 기본 이름표는 holds 의 첫 `INV-XX` 인데 그건 다섯 다
// `INV-Z13` 이라, 갈래 하나가 깨지면 다섯 변이가 전부 「잡혔다」로 보고된다. 검사 이름에도
// 같은 문자열이 들어 있어야 판정이 성립한다.
// ── 0022 의 네 열 — 제약 본문을 한 자리에서 조립한다 ──────────────────
//
// **네 열을 똑같이 고치는 변이**가 있어야 「열끼리 서로 대 보기만 하는」 검사의 빈틈이
// 드러난다(2026-09-11 test-auditor). 본문을 네 번 베껴 적으면 0022 가 바뀔 때 네 곳을
// 다 고쳐야 하고, 하나를 빠뜨리면 그 변이만 조용히 낡는다 — 그래서 여기서 만든다.
const T_COLS = [
  ["profiles", "username"],
  ["studies", "title"],
  ["chat_messages", "content"],
  ["notifications", "title"],
];

/** 0022 의 지우는 집합. 옵션으로 **한 조각만** 뺀다 — 갈래를 묶지 않는다. */
const VISIBLE_SET = ({ dropLocaleSpaces = false, tagEnd = 917631 } = {}) =>
  [
    `'[[:space:]]'`,
    dropLocaleSpaces ? null : `|| '|[' || chr(160) || chr(8199) || chr(8239) || ']'`,
    `|| '|' || chr(1564)`,
    `|| '|' || chr(6158)`,
    `|| '|[' || chr(8203) || '-' || chr(8205) || ']'`,
    `|| '|[' || chr(8288) || '-' || chr(8292) || ']'`,
    `|| '|' || chr(10240)`,
    `|| '|[' || chr(4447) || chr(4448) || chr(12644) || chr(65440) || ']'`,
    `|| '|' || chr(65279)`,
    `|| '|[' || chr(917504) || '-' || chr(${tagEnd}) || ']'`,
  ]
    .filter(Boolean)
    .join("\n             ");

const VISIBLE_ALL = (opts) =>
  T_COLS.map(
    ([t, c]) => `alter table public.${t} drop constraint if exists ${t}_${c}_visible;
      alter table public.${t} add constraint ${t}_${c}_visible
        check (regexp_replace(${c}, ${VISIBLE_SET(opts)}, '', 'g') <> '');`,
  ).join("\n      ");

/** 0022 의 금지 목록. `dropAlm` 은 U+061C 한 자만 뺀다. */
const BIDI_SET = ({ dropAlm = false } = {}) =>
  `'[' || ${dropAlm ? "" : "chr(1564) || "}chr(8206) || chr(8207) || chr(8234) || '-' || chr(8238)
              || chr(8294) || '-' || chr(8297) || ']'`;

const BIDI_ALL = (opts) =>
  T_COLS.map(
    ([t, c]) => `alter table public.${t} drop constraint if exists ${t}_${c}_no_bidi;
      alter table public.${t} add constraint ${t}_${c}_no_bidi
        check (${c} !~ (${BIDI_SET(opts)}));`,
  ).join("\n      ");

const Z13_BODY_MD5 = "6f8b8c77b85136720e7294ea308b08b2";

const Z13_BRANCHES = {
  // ① 본인
  self: "p_profile_id = p_viewer_id",
  // ② 볼 수 있는 스터디의 호스트
  host: `exists (
            select 1 from public.studies s
             where s.host_id = p_profile_id and private.study_is_visible(s.id, p_viewer_id)
          )`,
  // ③ 볼 수 있는 모집글의 작성자
  author: `exists (
            select 1 from public.posts p
             where p.author_id = p_profile_id and private.study_is_visible(p.study_id, p_viewer_id)
          )`,
  // ④-1 INV-Z11 이 보여 주기로 정한 참여자 행의 주인
  relation: `exists (
            select 1 from public.participants pt
             where pt.user_id = p_profile_id
               and (
                 pt.user_id = p_viewer_id
                 or private.is_study_host(pt.study_id, p_viewer_id)
                 or (pt.status = 'accepted' and private.is_study_member(pt.study_id, p_viewer_id))
               )
          )`,
  // ④-2 내가 읽을 수 있는 대화에서 메시지를 보낸 사람
  sender: `exists (
            select 1 from public.chat_messages m
             where m.sender_id = p_profile_id
               and private.is_chat_member(m.chat_id, p_viewer_id)
          )`,
};

/** 갈래 하나를 뺀 판정 함수를 심는 변이 조각. guard 가 원본 본문의 해시를 대조한다. */
function z13Without(drop) {
  if (!(drop in Z13_BRANCHES)) throw new Error(`Z13_BRANCHES 에 없는 갈래: ${drop}`);
  const kept = Object.entries(Z13_BRANCHES)
    .filter(([k]) => k !== drop)
    .map(([, v]) => v);
  // 전부 빠지면 `select ;` 가 되어 조용히 문법 오류로 죽는다. 그 전에 여기서 멈춘다.
  if (kept.length === 0) throw new Error("갈래를 전부 뺐다");
  return {
    guard: { schema: "private", fn: "profile_is_visible", md5: Z13_BODY_MD5 },
    sql: `
      create or replace function private.profile_is_visible(p_profile_id uuid, p_viewer_id uuid)
      returns boolean language sql stable security definer set search_path = '' as $fn$
        select ${kept.join("\n          or ")};
      $fn$;`,
  };
}

/** 변이 이름 → 무엇을 무력화하는가 + 그것을 붙들어야 할 테스트 */
const MUTATIONS = {
  // ── 0010 이 만든 강제 장치 셋 ──────────────────────────────────────────
  "a7-no-profile-trigger": {
    holds: "INV-A7 — 계정을 만들면 프로필이 함께 생긴다",
    // 트리거를 떼면 계정만 생긴다. 옛 코드가 남기던 상태가 바로 이것이다.
    sql: `drop trigger if exists on_auth_user_created on auth.users;`,
    // 트리거는 0010 이 다시 만든다 — 복구 목록에 0010 이 있으므로 undo 가 따로 필요 없다.
  },
  "a7-username-any-length": {
    holds: "INV-A7 — 이름 길이 규칙을 데이터베이스가 지킨다",
    // 제약을 떼면 앱을 안 거친 가입이 아무 길이나 넣는다.
    sql: `alter table public.profiles drop constraint if exists profiles_username_length;`,
  },
  "a7-blank-username": {
    holds: "INV-A7 — 빈 이름과 공백뿐인 이름도 가입을 막지 않는다",
    // 씻는 자리를 뺀다. 그러면 빈 문자열은 길이 0 이라 제약에 걸려 **가입 자체가 거절되고**,
    // 전각 공백은 길이 1 이라 통과해 **빈 줄로 뜨는 사용자**가 생긴다. 두 방향으로 깨진다.
    sql: `
      create or replace function private.profile_username_from_meta(p_id uuid, p_meta jsonb)
      returns text language sql immutable set search_path = '' as $fn$
        select left(coalesce(p_meta ->> 'username', '회원' || left(p_id::text, 8)), 20);
      $fn$;`,
  },
  "z12-expose-invoker-wrapper": {
    holds: "INV-Z12 — 노출된 스키마에 새 판정 통로가 생기면 걸린다",
    // **definer 가 아니다.** anon 에게 private 실행 권한이 있으므로(정책이 그 권한으로
    // 평가된다) 껍데기 하나면 문이 다시 열린다 — 안쪽 함수가 정책을 안 지나므로 답도
    // 정확히 나온다. 2026-09-05 실측: 이 껍데기를 심으니 비로그인 호출이 200 + 판정값.
    sql: `
      create or replace function public.can_read_members(p_study_id uuid, p_user_id uuid)
      returns boolean language sql stable as $fn$
        select private.is_study_member(p_study_id, p_user_id);
      $fn$;`,
    undo: `drop function if exists public.can_read_members(uuid, uuid);`,
  },
  "z12-expose-new-definer": {
    holds: "INV-Z12 — 노출된 스키마에 새 판정 통로가 생기면 걸린다",
    // 이름 목록에 **없는** 이름이다. 이름을 세는 검사는 이걸 못 보고 구조 검사만 본다 —
    // 그래서 구조 검사에 자기 홀더가 생긴다.
    sql: `
      create or replace function public.member_check(p_study_id uuid, p_user_id uuid)
      returns boolean language sql stable security definer set search_path = '' as $fn$
        select exists (select 1 from public.participants
                        where study_id = p_study_id and user_id = p_user_id and status = 'accepted');
      $fn$;`,
    undo: `drop function if exists public.member_check(uuid, uuid);`,
  },
  "z12-expose-via-composite": {
    holds: "INV-Z12 — 노출된 스키마에 새 판정 통로가 생기면 걸린다",
    // 구조 검사의 "행 인자는 계산 컬럼이라 면제"를 노린다. 그 면제가 성립하는 것은
    // **인자가 딱 하나이고 그것이 공개 테이블의 행 타입일 때**뿐이다 — 지어낸 복합 타입은
    // 읽을 행이 없으므로 JSON 으로 만들어 보내면 그만이다.
    sql: `
      drop type if exists public.member_q cascade;
      create type public.member_q as (study_id uuid, user_id uuid);
      create or replace function public.member_check2(q public.member_q)
      returns boolean language sql stable security definer set search_path = '' as $fn$
        select exists (select 1 from public.participants
                        where study_id = (q).study_id and user_id = (q).user_id
                          and status = 'accepted');
      $fn$;`,
    undo: `
      drop function if exists public.member_check2(public.member_q);
      drop type if exists public.member_q cascade;`,
  },
  "z12-expose-helper": {
    holds: "INV-Z12 — 인가 판정 함수가 API 에 노출되지 않는다",
    // 문을 도로 연다. **함수 본문은 그대로다** — 답이 틀려지는 것이 아니라
    // 아무나 물을 수 있게 되는 것이 이 변이가 만드는 상태다.
    sql: `
      create or replace function public.is_study_member(p_study_id uuid, p_user_id uuid) returns boolean
      language sql stable security definer set search_path = '' as $fn$
        select exists (
          select 1 from public.participants
           where study_id = p_study_id and user_id = p_user_id and status = 'accepted'
        );
      $fn$;`,
    // 0010 의 drop 이 다시 지운다. PostgREST 의 스키마 캐시는 이 설치에 걸린 DDL 감시
    // 이벤트 트리거(pgrst_ddl_watch · pgrst_drop_watch)가 심고 지울 때 각각 깨운다 —
    // 확인했다. 이 도구에 없는 필드(`after` 같은)를 적어 두면 아무 일도 안 하면서
    // 무언가 한 것처럼 읽히므로 적지 않는다.
  },
  // ── 0011 이 만든 강제 장치 (INV-Z13) ──────────────────────────────────
  // 갈래를 하나씩 빼는 다섯은 본문을 통째로 다시 적는다(z13Without). 갈래 하나를 빼는 것이
  // 그 변이의 내용이라 다른 방법이 없고, guard 가 원본 본문의 해시를 대조해서 원본이 바뀐
  // 뒤에 낡은 본문을 심는 것을 막는다.
  "z13-profiles-read-open": {
    holds: "INV-Z13 — 프로필은 볼 이유가 있는 사람에게만 보인다",
    // 원래 뚫려 있던 모양 그대로. 필터 없는 select 하나로 회원 명부 전체가 나온다.
    sql: `
      drop policy if exists profiles_read on public.profiles;
      create policy profiles_read on public.profiles for select using (true);`,
    // 0011 이 복구 목록에 있으므로 정책이 다시 걸린다.
  },
  "z13-logged-in-only": {
    holds: "INV-Z13 (S14) — 발견은 로그인 앞에 있다: 비로그인도 호스트·작성자를 읽는다",
    // 좁히는 쪽으로 틀린 경우. 「로그인한 사람만」은 명부 긁기를 막지만
    // **공개 모집글 상세에서 누가 여는 스터디인지가 빈칸이 된다.**
    sql: `
      drop policy if exists profiles_read on public.profiles;
      create policy profiles_read on public.profiles for select
      using ((select auth.uid()) is not null);`,
  },
  "z13-drop-self-branch": {
    tag: "INV-Z13 ①",
    holds: "INV-Z13 ① — 자기 프로필은 아무 관계가 없어도 읽는다",
    ...z13Without("self"),
  },
  "z13-drop-host-branch": {
    tag: "INV-Z13 ②",
    holds: "INV-Z13 ② — 볼 수 있는 스터디의 호스트는 비로그인에게도 보인다",
    ...z13Without("host"),
  },
  "z13-drop-author-branch": {
    tag: "INV-Z13 ③",
    holds: "INV-Z13 ③ — 볼 수 있는 모집글의 작성자는 비로그인에게도 보인다",
    ...z13Without("author"),
  },
  "z13-drop-relation-branch": {
    tag: "INV-Z13 ④-1",
    holds: "INV-Z13 ④-1 — INV-Z11 이 보여 주는 참여자 행의 주인은 프로필도 보인다",
    ...z13Without("relation"),
  },
  "z13-drop-sender-branch": {
    tag: "INV-Z13 ④-2",
    holds: "INV-Z13 ④-2 — 강퇴된 사람의 옛 메시지에서 이름이 빈칸이 되지 않는다",
    ...z13Without("sender"),
  },
  // ── 0012 가 만든 강제 장치 (INV-P8 실시간) ────────────────────────────
  "p8-topic-shape-loose": {
    holds: "INV-P8 (실시간) — 주제 이름이 uuid 모양일 때만 통과한다",
    // 0012 이전의 조건 그대로. 길이 36 과 글자 종류만 봐서 대시 36개도 통과하고,
    // 그 뒤의 ::uuid 형변환이 정책 평가 중에 죽는다.
    sql: `
      drop policy if exists chat_broadcast_read on realtime.messages;
      create policy chat_broadcast_read on realtime.messages for select to authenticated
      using (
        realtime.topic() ~ '^chat:[0-9a-fA-F-]{36}$'
        and private.is_chat_member(
              substring(realtime.topic() from 6)::uuid,
              (select auth.uid())
            )
      );`,
    // 0012 가 복구 목록에 있으므로 정책이 다시 걸린다.
  },
  "p8-topic-no-shape-check": {
    tag: "INV-P8",
    holds: "INV-P8 (실시간) — 모양이 아닌 주제는 오류가 아니라 null 이다",
    // 0013 이 만든 안전장치를 뺀다. 모양을 안 보고 바로 형변환하면 대시 36개짜리 주제에서
    // 예외가 나고, 그 예외가 정책 평가 중에 난다 — 구독이 오류로 끝나고 아무나 그것을 낼 수 있다.
    sql: `
      create or replace function private.chat_topic_uuid(p_topic text)
      returns uuid language sql immutable set search_path = '' as $fn$
        select substring(p_topic from 6)::uuid;
      $fn$;`,
    // 0013 이 복구 목록에 있으므로 함수가 다시 만들어진다.
  },
  "p8-topic-case-sensitive": {
    tag: "INV-P8",
    holds: "INV-P8 (실시간) — 표기가 갈려도 같은 대화를 가리킨다",
    // `~*` 를 `~` 로 되돌린다. 대문자로 주제를 만든 클라이언트가 구독을 못 하게 되는데,
    // 이 변이를 쓰기 전에는 그 상태가 초록불이었다 — 검사가 연산자를 자기 손으로 넣었다.
    sql: `
      create or replace function private.chat_topic_uuid(p_topic text)
      returns uuid language sql immutable set search_path = '' as $fn$
        select case
                 when p_topic ~ '^chat:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   then substring(p_topic from 6)::uuid
               end;
      $fn$;`,
  },
  "z8-participants-columns": {
    holds: "INV-Z8 (S7) — 호스트가 자기 참여 행의 user_id 를 남으로 바꿀 수 없다",
    sql: `grant update on public.participants to authenticated;`,
  },
  "z8-chatpart-columns": {
    holds: "INV-Z8 (S8) — 멤버가 chat_id 를 남의 방으로 바꿀 수 없다",
    // **열 권한만 열어서는 이 구멍이 안 열린다.** 열 권한을 통째로 준 뒤 실제로 눌러 보면
    // 여전히 42501 이 나오는데, 막고 있는 것은 갱신된 **새 행**에 다시 걸리는 읽기 정책
    // `chatpart_read_member` 다(is_chat_member 가 남의 방에 대해 거짓). 실측으로 확인했다.
    // 그래서 강제 위치가 둘이고, 하나만 걷어 낸 변이는 "아무도 안 붙들고 있다"가 아니라
    // "아무것도 무력화하지 못했다" 였다 — 그 둘은 결과가 같아 보여서 위험하다.
    sql: `
      grant update on public.chat_participants to authenticated;
      drop policy if exists chatpart_read_member on public.chat_participants;
      create policy chatpart_read_member on public.chat_participants for select using (true);`,
    // 읽기 정책은 0001 에만 있어 기본 복구 목록으로는 안 돌아온다.
    undo: `
      drop policy if exists chatpart_read_member on public.chat_participants;
      create policy chatpart_read_member on public.chat_participants for select
        using (private.is_chat_member(chat_id, (select auth.uid())));`,
  },
  "z8-posts-columns": {
    holds: "INV-Z9 — 이미 쓴 모집글을 남의 스터디로 옮길 수 없다",
    sql: `grant update on public.posts to authenticated;`,
  },
  "p8-no-leave": {
    holds: "INV-P8 — 강퇴·탈퇴하면 채팅 구성원에서 빠진다",
    sql: `
      create or replace function public.sync_study_chat() returns trigger
      language plpgsql security definer set search_path = '' as $fn$
      declare v_chat_id uuid;
      begin
        select id into v_chat_id from public.chats where study_id = new.study_id;
        if v_chat_id is null then return new; end if;
        if new.status = 'accepted' then
          insert into public.chat_participants (chat_id, user_id)
            values (v_chat_id, new.user_id) on conflict do nothing;
        end if;
        return new;
      end; $fn$;`,
  },
  "p8-join-when-pending": {
    holds: "INV-P8 — 대기 중인 신청자는 채팅방에 안 들어간다",
    sql: `
      create or replace function public.sync_study_chat() returns trigger
      language plpgsql security definer set search_path = '' as $fn$
      declare v_chat_id uuid;
      begin
        select id into v_chat_id from public.chats where study_id = new.study_id;
        if v_chat_id is null then return new; end if;
        insert into public.chat_participants (chat_id, user_id)
          values (v_chat_id, new.user_id) on conflict do nothing;
        return new;
      end; $fn$;`,
  },
  "p9-invoker-count": {
    holds: "INV-P9 — 파생값은 누가 묻든 같은 답을 준다",
    sql: `
      create or replace function private.study_accepted_count(p_study_id uuid) returns integer
      language sql stable set search_path = '' as $fn$
        select count(*)::integer from public.participants
         where study_id = p_study_id and status = 'accepted';
      $fn$;
      create or replace function private.study_is_recruiting(p_study_id uuid) returns boolean
      language sql stable set search_path = '' as $fn$
        select s.closed_at is null and s.deleted_at is null
           and private.study_accepted_count(s.id) < s.max_participants
          from public.studies s where s.id = p_study_id;
      $fn$;`,
  },
  "p9-drop-status-filter": {
    holds: "INV-P9 — 세는 것은 '수락된' 참여자다 (대기 중인 사람이 아니라)",
    sql: `
      create or replace function private.study_accepted_count(p_study_id uuid) returns integer
      language sql stable security definer set search_path = '' as $fn$
        select count(*)::integer from public.participants where study_id = p_study_id;
      $fn$;`,
  },
  "z2-self-accept": {
    holds: "INV-Z2 — 대기 중인 신청자가 자기 신청을 스스로 수락할 수 없다",
    // 자기 행이라 using 은 지나간다. 막는 것은 with check 의 status 조건 하나뿐이라,
    // 그것만 빼면 신청자가 호스트 승인 없이 멤버가 되고 트리거가 채팅방까지 넣어 준다.
    sql: `
      drop policy if exists participants_update_self on public.participants;
      create policy participants_update_self on public.participants for update
        using (user_id = (select auth.uid()))
        with check (user_id = (select auth.uid()));`,
    // 이 정책은 0001 에만 있다 — 기본 복구 목록(0002·0004)이 안 되돌린다.
    undo: `
      drop policy if exists participants_update_self on public.participants;
      create policy participants_update_self on public.participants for update
        using (user_id = (select auth.uid()))
        with check (user_id = (select auth.uid()) and status = 'withdrawn');`,
  },
  "p9-invoker-computed": {
    holds: "INV-P9 — 화면이 실제로 읽는 계산 컬럼도 누가 묻든 같은 답을 준다",
    // 화면은 rpc 쌍이 아니라 계산 컬럼 쌍을 쓴다. 여기서 definer 를 빼면 로그인하지 않은
    // 연결이 참여자 행을 못 읽어 인원이 0 으로 답하고, 마감된 스터디가 모집중으로 보인다.
    sql: `
      create or replace function public.accepted_count(public.studies) returns integer
      language sql stable set search_path = '' as $fn$
        select count(*)::integer from public.participants
         where study_id = $1.id and status = 'accepted';
      $fn$;`,
  },
  "p6-computed-drops-deleted": {
    holds: "INV-P6 — 지워진 스터디는 계산 컬럼도 모집 중이 아니라고 답한다",
    sql: `
      create or replace function public.recruiting(public.studies) returns boolean
      language sql stable security definer set search_path = '' as $fn$
        select $1.closed_at is null
           and public.accepted_count($1) < $1.max_participants;
      $fn$;`,
  },
  "z2-drop-self-update": {
    holds: "INV-Z2 — 본인의 탈퇴는 본인이 할 수 있다 (반대 절반)",
    // 정책이 통째로 사라지면 using 이 걸러 0행이 갱신되고 PostgREST 는 오류를 안 낸다.
    // 그래서 「error 가 null 이다」만 보는 단언은 이것을 못 잡는다 — 결과를 다시 읽어야 한다.
    sql: `drop policy if exists participants_update_self on public.participants;`,
    undo: `
      drop policy if exists participants_update_self on public.participants;
      create policy participants_update_self on public.participants for update
        using (user_id = (select auth.uid()))
        with check (user_id = (select auth.uid()) and status = 'withdrawn');`,
  },
  "p9-computed-drops-status-filter": {
    holds: "INV-P9 — 화면이 읽는 계산 컬럼도 '수락된' 사람만 센다",
    sql: `
      create or replace function public.accepted_count(public.studies) returns integer
      language sql stable security definer set search_path = '' as $fn$
        select count(*)::integer from public.participants where study_id = $1.id;
      $fn$;`,
  },
  "p6-computed-drops-closed": {
    holds: "INV-P6 — 호스트가 닫으면 계산 컬럼도 모집 중이 아니다",
    // 화면의 「모집중」 배지와 목록의 「모집중만」 필터가 이 값 하나로 갈린다.
    sql: `
      create or replace function public.recruiting(public.studies) returns boolean
      language sql stable security definer set search_path = '' as $fn$
        select $1.deleted_at is null
           and public.accepted_count($1) < $1.max_participants;
      $fn$;`,
  },
  "filter-code-concatenated": {
    holds: "주소창에서 온 카테고리 코드가 질의를 깨지 않는다 (화면 목록 문서)",
    tag: "필터 코드",
    // **이 변이가 없으면 그 검사 둘이 아무것도 안 붙든다.** 오늘 카테고리·지역 코드는
    // `.in()`·`.eq()` 를 지나므로 supabase-js 가 값을 감싸서 넘기고, 그래서 무엇을 넣어도
    // 안 깨진다 — 검사 스스로 「지금의 방벽이 아니라 회귀를 붙든다」고 적어 놓았다.
    // 그 주장이 판정 결과가 되려면 되살릴 회귀가 실제로 있어야 한다.
    //
    // 여기서는 값을 필터 문자열로 **이어 붙이게** 바꾼다. 그러면 쉼표가 든 값
    // (`it,design`)이 논리 트리를 깨서 PGRST100 이 난다.
    file: {
      path: "src/entities/post/api/post-query.ts",
      find: `    q = q.in("study.category_id", [...query.categories]);`,
      replace: `    q = q.or(query.categories.map((c) => \`study.category_id.eq.\${c}\`).join(","));`,
    },
  },
  "deadline-order-inside-embed": {
    holds: "「마감 임박순」이 실제로 마감일 순서로 나온다 (화면 목록 문서)",
    tag: "마감 임박순",
    // **소스 파일을 바꾸는 변이다.** 이 결함은 데이터베이스가 아니라 조회 코드에 있었고,
    // 오류를 안 내고 그럴듯한 순서를 낸다. 손으로 한 번 확인했다는 것은 다음 사람에게
    // 안 남는다 — 그것이 이 도구를 만든 이유다.
    file: {
      path: "src/entities/post/api/post-order.ts",
      find: `{ column: "study_deadline_rank", options: { ascending: true } }`,
      replace: `{ column: "recruit_until", options: { referencedTable: "study", ascending: true } }`,
    },
  },
  "deadline-rank-dropped": {
    holds: "「마감 임박순」의 순위를 조회 코드가 실제로 건다 (화면 목록 문서)",
    tag: "마감 임박순",
    // 정렬 키를 통째로 빼면 남는 것은 tiebreak(id) 뿐이다. 준비물의 id 를 손으로 줘서
    // 그때 반드시 틀린 순서가 나오게 해 뒀다(list-order.test.ts) — 안 그러면 uuid 운으로
    // 맞는 순서가 나와 「아무도 안 붙들고 있다」로 보고된다.
    //
    // **replace 는 깨끗한 소스에 없는 문장이어야 한다.** 처음엔 여기에 다른 정렬 키를
    // 적었는데 그것은 표에 원래 있는 줄이라, 복구가 손대지 않은 그 줄까지 바꿔 놓고
    // 「복구 완료」를 찍었다. 아래 복구·심기의 개수 검사가 그래서 생겼다.
    file: {
      path: "src/entities/post/api/post-order.ts",
      find: `  deadline: [{ column: "study_deadline_rank", options: { ascending: true } }],\n`,
      replace: `  deadline: [],\n`,
    },
  },
  "deadline-rank-constant": {
    holds: "「마감 임박순」의 순위를 데이터베이스가 실제로 계산한다 (화면 목록 문서)",
    tag: "마감 임박순",
    // 앞의 둘은 조회 코드 쪽이다. 이것은 같은 규칙의 **데이터베이스 쪽** — 순위 함수가
    // 늘 0 을 답하면 정렬 키는 걸려 있는데 순서가 안 갈린다.
    sql: `
      create or replace function public.study_deadline_rank(public.posts) returns integer
      language sql stable set search_path = '' as $fn$ select 0; $fn$;`,
  },
  "deadline-rank-off-by-one": {
    holds: "「마감 임박순」에서 오늘 마감인 것은 아직 안 지났다 (화면 목록 문서)",
    tag: "마감 임박순",
    // 경계 하나만 민다(`>=` → `>`). 오늘이 마감일인 스터디가 「지났다」 덩어리로 넘어간다.
    // 준비물에 오늘 날짜가 없으면 이 변이는 어떤 검사도 못 깨뜨린다.
    sql: `
      create or replace function public.study_deadline_rank(public.posts) returns integer
      language sql stable set search_path = '' as $fn$
        select case
                 when u.d is null         then 2000000
                 when u.d > current_date  then least(u.d - current_date, 999999)
                 else                          2000001 + least(current_date - u.d, 999998)
               end
        from (select public.study_recruit_until($1) as d) u;
      $fn$;`,
  },
  "sort-whitelist-dropped": {
    holds: "주소창의 아무 값이 정렬 키가 되지 않는다",
    tag: "정렬 화이트리스트",
    // 화이트리스트를 단언으로 바꾼다. 임의 컬럼이 `.order()` 로 가지지는 않는다 —
    // 정렬 표의 **키**로만 쓰이기 때문이다. 그리고 `post-query.ts` 의 되돌림이 붙은 뒤로는
    // 500 도 안 난다(그 되돌림은 `sort-fallback-dropped` 가 따로 붙든다). 그러니 이 변이가
    // 실제로 깨뜨리는 것은 「주소창의 값이 어휘 안으로 좁혀진다」는 약속 하나다.
    file: {
      path: "src/entities/post/api/post-order.ts",
      find: `  return SORTS.includes(value as Sort) ? (value as Sort) : "latest";`,
      replace: `  return value as Sort;`,
    },
  },
  "p6-rpc-drops-deleted": {
    holds: "INV-P6 — 지워진 스터디는 함수 쌍에서도 모집 중이 아니다",
    // 같은 공식이 데이터베이스에 두 벌 있다(함수 쌍 · 계산 컬럼 쌍). 계산 컬럼 쪽만
    // 붙들려 있어서, RPC 쪽의 `deleted_at is null` 을 지워도 전부 초록불이었다.
    sql: `
      create or replace function private.study_is_recruiting(p_study_id uuid) returns boolean
      language sql stable security definer set search_path = '' as $fn$
        select s.closed_at is null
           and private.study_accepted_count(s.id) < s.max_participants
          from public.studies s where s.id = p_study_id;
      $fn$;`,
  },
  "sort-fallback-dropped": {
    holds: "정렬 화이트리스트가 뚫려도 질의는 최신순으로 떨어진다",
    tag: "정렬 화이트리스트",
    // 화이트리스트 뒤의 두 번째 방벽. 이 되돌림이 없으면 어휘 밖의 값이 undefined 를
    // 순회하다 목록 화면 전체가 500 이 된다 — 로그인 없이 누구나 낼 수 있는 500 이다.
    file: {
      path: "src/entities/post/api/post-query.ts",
      find: `  for (const key of SORT_ORDER[query.sort ?? "latest"] ?? SORT_ORDER.latest) {`,
      replace: `  for (const key of SORT_ORDER[query.sort ?? "latest"]) {`,
    },
  },
  "deadline-rank-off-by-one-lenient": {
    holds: "「마감 임박순」에서 어제 마감은 이미 지났다 (화면 목록 문서)",
    tag: "마감 임박순",
    // 경계를 반대 방향으로 민다. `deadline-rank-off-by-one` 은 오늘을 뒤로 보내고,
    // 이것은 어제를 앞으로 끌어온다 — 「오늘 자정까지는 봐 준다」로 읽은 코드의 모양이다.
    // 미는 방향이 하나뿐이면 26/26 이라는 숫자가 이 구멍을 못 본다.
    sql: `
      create or replace function public.study_deadline_rank(public.posts) returns integer
      language sql stable set search_path = '' as $fn$
        select case
                 when u.d is null                then 2000000
                 when u.d = 'infinity'::date     then 999999
                 when u.d = '-infinity'::date    then 2999999
                 when u.d >= current_date - 1    then least(u.d - current_date, 999999)
                 else                                 2000001 + least(current_date - u.d, 999998)
               end
        from (select public.study_recruit_until($1) as d) u;
      $fn$;`,
  },
  "deadline-rank-uncapped": {
    holds: "「마감 임박순」의 띠가 겹치지 않는다 (화면 목록 문서)",
    tag: "마감 임박순",
    // 상한을 자르는 least 를 뺀다. 아주 먼 미래의 마감일이 「지난 마감일」 띠의 숫자
    // 범위로 넘어가, 아직 오지도 않은 마감일이 목록의 꼬리에 붙는다.
    // 주석이 "least 가 겹치지 않는 것을 보장한다"고 선언한 장치라 검사 밖에 두지 않는다.
    sql: `
      create or replace function public.study_deadline_rank(public.posts) returns integer
      language sql stable set search_path = '' as $fn$
        select case
                 when u.d is null                then 2000000
                 when u.d = 'infinity'::date     then 999999
                 when u.d = '-infinity'::date    then 2999999
                 when u.d >= current_date        then (u.d - current_date)
                 else                                 2000001 + (current_date - u.d)
               end
        from (select public.study_recruit_until($1) as d) u;
      $fn$;`,
  },
  "recruit-until-allows-infinity": {
    holds: "무한한 마감일은 데이터베이스가 거부한다",
    tag: "달력에 있는 날짜",
    // 제약을 뗀다. 무한값이 들어오면 순위 함수의 뺄셈이 죽어 목록이 통째로 500 이 되는데,
    // 0009 의 안전 실패 가지가 그 뒤를 받친다 — 그래서 이 변이가 깨뜨리는 것은
    // 「거부한다」는 약속이지 목록의 생존이 아니다.
    sql: `alter table public.studies drop constraint if exists studies_recruit_until_finite;`,
    undo: `
      alter table public.studies drop constraint if exists studies_recruit_until_finite;
      alter table public.studies add constraint studies_recruit_until_finite
        check (recruit_until is null
               or (recruit_until > '-infinity'::date and recruit_until < 'infinity'::date));`,
  },
  // ── 스터디 제목의 모양 (0020) ──────────────────────────────────────────
  //
  // 제약 하나에 갈래가 넷 들어 있다(상한 · 하한 · 공백뿐 · 제어문자) + 사본 쪽에 하나 더.
  // 통째로 떼면 검사 여럿이 한꺼번에 빨간불이 나는데, 그 빨간불은 갈래 하나하나가
  // 붙들려 있다는 증거가 못 된다. 갈래마다 따로 무력화하고 이름표도 따로 단다.
  //
  // **이름표에 숫자를 쓰지 않는다** — 검사 이름이 `${TITLE_MAX}자는…` 템플릿이라
  // 앱 상수를 건드리는 변이를 돌리면 이름의 숫자가 같이 바뀐다.
  "study-title-upper-widened": {
    holds: "스터디 제목의 상한이 앱과 같은 값이다",
    tag: "들어가고",
    sql: `alter table public.studies drop constraint if exists studies_title_length;
      alter table public.studies add constraint studies_title_length
        check (char_length(title) between 1 and 61 and btrim(title) <> '');`,
  },
  // 하한(1자) 변이는 없다 — 제약이 하한을 따로 안 적는다. `btrim(title) <> ''` 가
  // 빈 문자열까지 덮으므로 갈래가 아니라 한 갈래다(2026-09-09 변이 검증에서 드러났다).
  "study-title-allows-blank": {
    holds: "공백뿐인 제목도 데이터베이스가 거부한다",
    tag: "공백뿐인",
    // 길이만 보는 옛 모양으로 되돌린다. `char_length('   ')` 는 3이라 통과한다.
    sql: `alter table public.studies drop constraint if exists studies_title_length;
      alter table public.studies add constraint studies_title_length
        check (char_length(title) between 1 and 60);`,
  },
  "study-title-allows-control": {
    holds: "제어문자가 든 제목은 데이터베이스가 거부한다",
    tag: "제어문자",
    sql: `alter table public.studies drop constraint if exists studies_title_no_control;`,
  },
  "notifications-title-uncapped": {
    holds: "알림에 실린 제목도 같은 상한을 받는다",
    tag: "알림에 실린",
    // 사본 쪽 제약이다. 원본이 좁아진 뒤로 트리거가 이것에 걸릴 일은 없지만, 떼면
    // 「지금 이후로」라는 단서 없이 상한을 말할 수 없게 된다.
    sql: `alter table public.notifications drop constraint if exists notifications_title_length;`,
  },

  // ── 사람이 쓴 글자가 제 자리에 머문다 (0022 · INV-T1~T3) ────────────────
  //
  // **강제 장치 하나마다 변이 하나다.** 열 넷 × 판정 둘이라 여덟이고, 묶어서 빼면 그중
  // 하나만 붙들려 있어도 「잡혔다」가 나온다.
  "username-visible-dropped": {
    holds: "INV-T1 — 보이지 않는 글자만으로 된 이름이 거부된다",
    tag: "보이지 않는 글자만으로 된 이름",
    sql: `alter table public.profiles drop constraint if exists profiles_username_visible;`,
  },
  "title-visible-dropped": {
    holds: "INV-T1 — 보이지 않는 글자만으로 된 제목이 거부된다",
    tag: "제목에도 같은 판정이",
    sql: `alter table public.studies drop constraint if exists studies_title_visible;`,
  },
  "content-visible-dropped": {
    holds: "INV-T1 — 보이지 않는 글자만으로 된 본문이 거부된다",
    tag: "폭 없는 글자까지 넓어졌다",
    sql: `alter table public.chat_messages drop constraint if exists chat_messages_content_visible;`,
  },
  "notification-visible-dropped": {
    holds: "INV-T1 — 알림 행의 제목에도 같은 판정이 걸린다",
    tag: "INV-T1 (S5)",
    sql: `alter table public.notifications drop constraint if exists notifications_title_visible;`,
  },
  "username-bidi-dropped": {
    holds: "INV-T2 — 서식 문자가 든 이름이 거부된다",
    // S4d 를 이름용·본문용으로 쪼개면서 이름표도 갈랐다 — 하나로 두면 어느 갈래가 깨졌는지
    // 판정이 못 가른다(2026-09-11).
    tag: "S4d, 이름",
    sql: `alter table public.profiles drop constraint if exists profiles_username_no_bidi;`,
  },
  "title-bidi-dropped": {
    holds: "INV-T2 — 서식 문자가 든 제목이 거부된다",
    tag: "부류 전체가 막힌다",
    sql: `alter table public.studies drop constraint if exists studies_title_no_bidi;`,
  },
  "content-bidi-dropped": {
    holds: "INV-T2 — 서식 문자가 든 본문이 거부된다",
    tag: "S4d, 본문",
    sql: `alter table public.chat_messages drop constraint if exists chat_messages_content_no_bidi;`,
  },
  "notification-bidi-dropped": {
    holds: "INV-T2 — 알림 행의 제목에도 서식 문자 금지가 걸린다",
    tag: "INV-T2 (S5)",
    sql: `alter table public.notifications drop constraint if exists notifications_title_no_bidi;`,
  },

  // **떼는 것 말고 좁히는 것.** 위 여덟은 제약을 통째로 없애므로 아무 검사나 하나면 잡힌다.
  // 아래 둘은 **집합만 되돌린다** — 판정이 그 자리에 그대로 있어서, 집합을 붙들지 않는
  // 검사는 전부 초록불이다.
  "visible-set-narrowed-to-space": {
    holds: "INV-T1 — 지우는 집합이 폭 없는 글자까지 덮는다 (0021 수준으로 되돌리기)",
    tag: "제목에도 같은 판정이",
    // `[[:space:]]` + BOM 만 보던 0021 의 모양이다. U+200B·U+2060·U+180E 가 빠져나간다.
    sql: `alter table public.studies drop constraint if exists studies_title_visible;
      alter table public.studies add constraint studies_title_visible
        check (regexp_replace(title, '[[:space:]]|' || chr(65279), '', 'g') <> '');`,
  },
  "bidi-narrowed-to-rlo": {
    holds: "INV-T2 — 서식 문자를 부류로 막는다 (실측에서 깬 한 자만 막기로 되돌리기)",
    tag: "부류 전체가 막힌다",
    // **이 변이가 이 사이클의 핵심이다.** 한글 제목으로만 재면 낫표 경계를 깨는 것은
    // U+202E 하나뿐이라 「깬 것만 막자」가 합리적으로 보인다. 그 구멍은 히브리어 제목
    // 하나로 열린다(2026-09-11 실측). 이것을 잡는 검사가 없으면 그 되돌림을 아무도 못 막는다.
    sql: `alter table public.studies drop constraint if exists studies_title_no_bidi;
      alter table public.studies add constraint studies_title_no_bidi
        check (title !~ ('[' || chr(8238) || ']'));`,
  },
  "bidi-bans-zwj": {
    holds: "INV-T2 — ZWJ 는 금지 목록에 없다 (가족 이모지가 그것으로 이어진다)",
    tag: "보통 이름과 이모지가 든 이름은 들어간다",
    // 반대 방향의 변이다 — **넓히는 쪽**. 목록에 ZWJ 를 더하면 위 검사들은 전부 그대로
    // 통과하는데 정상 메시지가 막힌다. 반대 절반이 없으면 아무도 못 잡는다.
    sql: `alter table public.profiles drop constraint if exists profiles_username_no_bidi;
      alter table public.profiles add constraint profiles_username_no_bidi
        check (username !~ ('[' || chr(8206) || chr(8207) || chr(8205) || chr(8234) || '-'
                                || chr(8238) || chr(8294) || '-' || chr(8297) || ']'));`,
  },

  // ── 앱 층 — 데이터베이스와 범위가 같아야 한다 ──────────────────────────
  "app-control-range-narrowed": {
    holds: "INV-T2 — 앱의 제어문자 범위가 데이터베이스와 같다",
    tag: "C1 구역",
    suite: "unit",
    // 2026-09-11 까지 이름 쪽이 실제로 이 모양이었다. C1 구역이 빠진다.
    file: {
      path: "src/shared/lib/text.ts",
      find: `    if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) return true;`,
      replace: `    if (code < 0x20 || code === 0x7f) return true;`,
    },
  },
  "app-visible-uses-trim": {
    holds: "INV-T1 — 앱의 「내용이 있나」가 trim 이 아니다",
    tag: "보이지 않는 글자만으로 된 값",
    suite: "unit",
    // `trim()` 은 양끝만 보고, JS 의 공백 집합에는 폭 없는 글자가 없다.
    file: {
      path: "src/shared/lib/text.ts",
      find: `  return text.replace(보이지않는글자, "") !== "";`,
      replace: `  return text.trim() !== "";`,
    },
  },
  "app-bidi-blind": {
    holds: "INV-T2 — 앱도 서식 문자를 본다",
    tag: "열 자를 전부 본다",
    suite: "unit",
    file: {
      path: "src/shared/lib/text.ts",
      find: `  for (const ch of text) if (양방향서식.has(ch)) return true;`,
      replace: `  for (const ch of text) if (false && 양방향서식.has(ch)) return true;`,
    },
  },
  "notification-name-not-isolated": {
    holds: "INV-T3 — 알림 줄의 제목이 방향 격리 안에 있다",
    tag: "방향 격리 안에 있다",
    suite: "unit",
    // `<b>` 로 되돌린다. 보이는 것은 똑같고(굵기는 `.name` 이 준다) 바뀌는 것은
    // 제목 안의 서식 문자가 문단 끝까지 간다는 것뿐이다 — 눈으로는 안 보이는 되돌림이다.
    file: {
      path: "src/widgets/site-header/ui/NotificationBell.tsx",
      find: `        <bdi className={styles.name}>{body}</bdi>`,
      replace: `        <b className={styles.name}>{body}</b>`,
    },
  },

  // **한 열만 좁히는 변이 둘.** 위의 「떼는 것」 여덟은 아무 검사나 하나면 잡히고,
  // `visible-set-narrowed-to-space` · `bidi-narrowed-to-rlo` 는 **제목 한 열**만 좁힌다.
  // 이 스펙의 문제 진술은 「같은 종류의 값이 열마다 다르게 처리된다」이므로, **다른 열을
  // 좁히는 변이**가 있어야 그 재발을 붙드는 검사가 실제로 도는지 알 수 있다.
  // 2026-09-11 까지 아래 둘이 없었고, 그래서 이름 제약을 좁혀도 알림 제약을 되돌려도
  // 전부 초록불이었다(test-auditor).
  "username-bidi-narrowed-to-isolates": {
    holds: "INV-T2 — 이름 제약도 부류 열두 자를 전부 막는다",
    tag: "열두 자가 네 열에서",
    // U+2066–2069(격리 넷)만 남긴다. RLO·RLE·LRM·PDF·ALM 이 이름으로 들어온다.
    sql: `alter table public.profiles drop constraint if exists profiles_username_no_bidi;
      alter table public.profiles add constraint profiles_username_no_bidi
        check (username !~ ('[' || chr(8294) || '-' || chr(8297) || ']'));`,
  },
  // **네 열을 똑같이 고치는 변이 둘.** 한 열만 좁히는 변이(`username-bidi-narrowed-to-isolates`
  // 등)는 열끼리 대 보는 검사가 잡는다. 그런데 **넷을 같은 모양으로 고치면 그 대조가 통과한다**
  // — 서로 같기 때문이다(2026-09-11 test-auditor). 그래서 제약 본문이 **절대 기준**과도
  // 같은지 보는 단언을 뒀고, 아래 둘이 그 단언을 붙든다.
  //
  // 본문을 네 번 베껴 적지 않고 여기서 조립한다 — 베껴 적으면 0022 가 바뀔 때 네 곳을
  // 다 고쳐야 하고, 하나를 빠뜨리면 그 변이만 조용히 낡는다.
  "visible-set-drops-locale-spaces-everywhere": {
    holds: "INV-T1 — 네 열의 지우는 집합이 글자까지 같다 (로케일 방어)",
    tag: "지우는 집합이 같은 글자다",
    // U+00A0·U+2007·U+202F 를 **네 곳에서 같이** 뺀다. 로컬 ctype 에서는 `[[:space:]]` 가
    // 대신 물어서 **값으로 재는 검사가 하나도 안 깨진다.** 0022 가 「배포처에서도 걸린다는
    // 근거가 없어서 명시한다」고 적어 둔 그 방벽이 통째로 사라지는데 화면상 아무 일도 없다.
    sql: VISIBLE_ALL({ dropLocaleSpaces: true }),
  },
  "visible-tag-range-shortened-everywhere": {
    holds: "INV-T1 — 네 열의 지우는 집합이 글자까지 같다 (태그 문자 끝)",
    tag: "지우는 집합이 같은 글자다",
    // 태그 문자 구역의 끝을 U+E007F 에서 U+E0060 으로 **네 곳에서 같이** 줄인다.
    // 행렬이 고른 태그 문자는 U+E0020 하나라 값으로는 원리상 안 잡힌다.
    sql: VISIBLE_ALL({ tagEnd: 917600 }),
  },
  "bidi-narrowed-everywhere": {
    holds: "INV-T2 — 네 열의 금지 목록이 글자까지 같다",
    tag: "금지 목록이 같은 글자다",
    // U+061C 를 **네 곳에서 같이** 뺀다. 그 한 자는 제어문자도 공백도 아니고 지우는 집합
    // 쪽에서는 다른 제약이 물 수도 있어서, 열끼리 대 보는 검사로는 안 잡힌다.
    sql: BIDI_ALL({ dropAlm: true }),
  },
  "username-visible-tag-range-shortened": {
    holds: "INV-T1 — 네 열의 지우는 집합이 글자까지 같다",
    tag: "지우는 집합이 같은 글자다",
    // **값으로 재는 검사로는 원리상 안 잡히는 되돌림이다.** 태그 문자 구역의 끝을
    // U+E007F 에서 U+E0060 으로 줄인다 — 위 행렬이 고른 값은 U+E0020 이라 여전히
    // 지워지고, 네 열의 답이 하나도 안 갈린다. 갈리는 것은 **내가 안 고른 값**뿐이고,
    // 그것을 말할 수 있는 것은 제약 본문을 서로 대 보는 검사뿐이다.
    sql: `alter table public.profiles drop constraint if exists profiles_username_visible;
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
                   || '|[' || chr(917504) || '-' || chr(917600) || ']',
                 '', 'g') <> '');`,
  },
  "notification-visible-narrowed-to-space": {
    holds: "INV-T1 — 알림 제목의 지우는 집합도 폭 없는 글자까지 덮는다",
    tag: "스물여섯이 네 열에서",
    // 0021 수준(`[[:space:]]` + BOM)으로 되돌린다. 알림 열은 U+3000 한 값으로만 재고
    // 있었는데 그 값은 `[[:space:]]` 에도 들어 있어서, 이 되돌림이 안 잡혔다.
    sql: `alter table public.notifications drop constraint if exists notifications_title_visible;
      alter table public.notifications add constraint notifications_title_visible
        check (regexp_replace(title, '[[:space:]]|' || chr(65279), '', 'g') <> '');`,
  },

  // ── 앱 층 **호출 자리** — 판정이 그 자리에 실제로 걸려 있나 ─────────────
  //
  // 위 셋은 `src/shared/lib/text.ts` 의 **판정 자체**를 무력화한다. 아래 여섯은 그
  // 판정을 **부르는 자리**를 하나씩 지운다 — 판정은 멀쩡한데 아무도 안 부르는 상태다.
  //
  // **이 여섯이 2026-09-11 까지 전부 빠져나갔다**(test-auditor). 호출을 통째로 지워도
  // 데이터베이스 제약이 같은 값을 대신 거부하므로 통합 검사가 안 갈리고, 유닛 쪽에는
  // 붙드는 검사가 한 건도 없었다. 바뀌는 것은 **사용자가 보는 문구** 하나인데, 그것이
  // 이 판정이 있는 유일한 이유다 — 제약까지 가면 「잠시 뒤 다시 시도해 주세요」가 뜨고
  // 다시 시도해도 절대 성공하지 않는다.
  //
  // **갈래마다 변이를 따로 둔다.** 「보이는 내용」과 「서식 문자」를 함께 지우면 둘 중
  // 하나만 붙들려 있어도 「잡혔다」가 나온다.
  "app-username-visible-uncalled": {
    holds: "INV-T1 — 이름 저장이 「보이는 내용이 있나」를 본다",
    tag: "보이지 않는 글자만으로 된 이름은 데이터베이스에",
    suite: "unit",
    file: {
      path: "src/features/edit-profile/api/save-profile.ts",
      find: `  if (!username || !hasVisibleContent(username)) {`,
      replace: `  if (!username) {`,
    },
  },
  "app-username-bidi-uncalled": {
    holds: "INV-T2 — 이름 저장이 서식 문자를 본다",
    tag: "양방향 서식 문자가 든 이름은",
    suite: "unit",
    // 제어문자 쪽은 남긴다 — 갈래를 묶으면 그쪽 검사 하나로 이 변이가 「잡혔다」가 된다.
    file: {
      path: "src/features/edit-profile/api/save-profile.ts",
      find: `  if (hasControlChars(username) || hasBidiFormatting(username)) {`,
      replace: `  if (hasControlChars(username)) {`,
    },
  },
  "app-title-visible-uncalled": {
    holds: "INV-T1 — 제목 읽기가 「보이는 내용이 있나」를 본다",
    tag: "보이지 않는 글자만으로 된 제목은",
    suite: "unit",
    file: {
      path: "src/entities/study/model/study-form.ts",
      find: `  if (!title || !hasVisibleContent(title)) {`,
      replace: `  if (!title) {`,
    },
  },
  "app-title-bidi-uncalled": {
    holds: "INV-T2 — 제목 읽기가 서식 문자를 본다",
    tag: "양방향 서식 문자가 든 제목은",
    suite: "unit",
    file: {
      path: "src/entities/study/model/study-form.ts",
      find: `  if (hasControlChars(title) || hasBidiFormatting(title)) {`,
      replace: `  if (hasControlChars(title)) {`,
    },
  },
  "app-content-visible-uncalled": {
    holds: "INV-T1 — 메시지 보내기가 「보이는 내용이 있나」를 본다",
    tag: "보이지 않는 글자만으로 된 본문은",
    suite: "unit",
    // **`content === ""` 로 좁힌다** — 통째로 지우면 「공백만 보내면 거부한다」가 빨간불을
    // 내서, 폭 없는 글자를 붙드는 검사가 없어도 「잡혔다」가 된다. 0021 수준으로 되돌리는
    // 모양이 이것이다.
    file: {
      path: "src/features/chat/api/send-message.ts",
      find: `  if (!hasVisibleContent(content)) {`,
      replace: `  if (content === "") {`,
    },
  },
  "app-content-bidi-uncalled": {
    holds: "INV-T2 — 메시지 보내기가 서식 문자를 본다",
    tag: "양방향 서식 문자가 든 본문은",
    suite: "unit",
    file: {
      path: "src/features/chat/api/send-message.ts",
      find: `  if (hasControlChars(content) || hasBidiFormatting(content)) {`,
      replace: `  if (hasControlChars(content) || false) {`,
    },
  },

  // **판정 순서를 바꾸는 변이 셋.** 블록 자리를 통째로 옮기는 대신 한 줄로 같은 결과를
  // 만든다 — 「보이는 내용이 없다」가 서식 문자가 든 값을 **안 잡고 넘기게** 하면, 그 값은
  // 아래 서식 문자 블록까지 내려가 문구가 바뀐다. 나머지 값의 답은 하나도 안 바뀐다.
  //
  // 가르는 값은 U+061C 하나뿐이다 — 지우는 집합과 금지 목록에 **둘 다** 든 글자가 그것뿐이라서.
  // 그 값이 검사 목록에 없으면 이 변이가 통째로 빠져나간다(2026-09-11 test-auditor).
  "app-username-bidi-wins-order": {
    holds: "INV-T1 — 이름은 「적어 주세요」 판정이 서식 문자보다 먼저다",
    tag: "두 판정에 다 걸리는 이름은",
    suite: "unit",
    file: {
      path: "src/features/edit-profile/api/save-profile.ts",
      find: `  if (!username || !hasVisibleContent(username)) {`,
      replace: `  if (!username || (!hasBidiFormatting(username) && !hasVisibleContent(username))) {`,
    },
  },
  "app-title-bidi-wins-order": {
    holds: "INV-T1 — 제목은 「적어 주세요」 판정이 서식 문자보다 먼저다",
    tag: "두 판정에 다 걸리는 제목은",
    suite: "unit",
    file: {
      path: "src/entities/study/model/study-form.ts",
      find: `  if (!title || !hasVisibleContent(title)) {`,
      replace: `  if (!title || (!hasBidiFormatting(title) && !hasVisibleContent(title))) {`,
    },
  },
  "app-content-bidi-wins-order": {
    holds: "INV-T1 — 본문은 「적어 주세요」 판정이 서식 문자보다 먼저다",
    tag: "두 판정에 다 걸리는 본문은",
    suite: "unit",
    file: {
      path: "src/features/chat/api/send-message.ts",
      find: `  if (!hasVisibleContent(content)) {`,
      replace: `  if (!hasBidiFormatting(content) && !hasVisibleContent(content)) {`,
    },
  },

  // **넓히는 쪽 변이.** 위 변이들은 전부 판정을 좁히거나 없앤다. 이것은 한 글자만
  // 넓히는데, 넓어지는 그 한 글자가 U+0020 이라 **띄어쓰기가 든 이름·제목·메시지를
  // 앱이 전부 거부한다** — 이 제품의 정상 입력 거의 전부다. 2026-09-11 까지 이 방향을
  // 붙드는 검사가 한 건도 없었다(test-auditor).
  "app-control-range-widened": {
    holds: "INV-T2 — 앱의 제어문자 범위가 U+0020 을 안 삼킨다",
    tag: "U+0020 보통 공백은 제어문자가 아니다",
    suite: "unit",
    file: {
      path: "src/shared/lib/text.ts",
      find: `    if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) return true;`,
      replace: `    if (code <= 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) return true;`,
    },
  },

  // **태그는 그대로 두고 CSS 한 줄로 격리를 끄는 변이.** `<bdi>` 의 격리는 사용자
  // 에이전트 스타일시트의 `unicode-bidi: isolate` 가 주는 것이라, 저자 스타일이 그
  // 속성을 건드리면 그것이 이긴다. 태그를 보는 검사는 전부 초록불인데 브라우저에서는
  // `<b>` 였을 때와 똑같이 낫표 경계가 뒤집힌다 — jsdom 은 배치를 안 하므로 그리는
  // 검사로는 원리상 못 잡는다(2026-09-11 test-auditor).
  "notification-name-bidi-unset-by-css": {
    holds: "INV-T3 — 방향 격리가 CSS 로 꺼져 있지 않다",
    tag: "방향 격리가 CSS 한 줄로",
    suite: "unit",
    file: {
      path: "src/widgets/site-header/ui/notification-bell.module.css",
      find: `.name {
  font-weight: 700;`,
      replace: `.name {
  unicode-bidi: normal;
  font-weight: 700;`,
    },
  },

  // **태그를 그대로 둔 채 격리를 끄는 길이 셋이다.** 위 변이는 속성 이름이 보이는 한 줄만
  // 심는다. 아래 둘은 **이름이 안 보이거나 파일이 다른** 길이고, 2026-09-11 까지 둘 다
  // 아무도 안 붙들었다(test-auditor).
  "notification-name-all-unset": {
    holds: "INV-T3 — `all` 한 줄로도 방향 격리가 안 꺼진다",
    tag: "방향 격리가 CSS 한 줄로",
    suite: "unit",
    // `all: unset` 은 `unicode-bidi` 를 `normal` 로 되돌린다. 속성 이름이 안 보이므로
    // 「`unicode-bidi` 가 있나」만 보는 검사는 초록불이다.
    file: {
      path: "src/widgets/site-header/ui/notification-bell.module.css",
      find: `.name {
  font-weight: 700;`,
      replace: `.name {
  all: unset;
  font-weight: 700;`,
    },
  },
  "bdi-unset-in-global-css": {
    holds: "INV-T3 — 다른 파일에서도 방향 격리를 못 끈다",
    tag: "방향 격리가 CSS 한 줄로",
    suite: "unit",
    // 알림 줄의 요소를 **그 파일 밖에서** 맞힌다. 모듈 CSS 한 장만 읽는 검사는 못 본다.
    file: {
      path: "src/app/globals.css",
      find: `.form-missing {`,
      replace: `bdi {
  unicode-bidi: normal;
}

.form-missing {`,
    },
  },

  // ── 실시간 방송에 클라이언트가 쓸 수 있나 (0006 → 0012 · INV-M1~M5) ─────
  //
  // **이 변이가 없어서 그 검사 파일 전체에 변이가 0건이었다**(2026-09-11 test-auditor).
  // 방 화면은 실시간으로 온 행을 검증 없이 목록에 넣으므로, 0021 의 제약 전부가 그
  // 경로에는 안 걸린다. 오늘 안 새는 이유는 `realtime.messages` 에 **쓰기 정책이 없다**는
  // 사실 하나뿐이고, 그 사실은 `for insert` 한 줄로 사라진다.
  "realtime-broadcast-insert-open": {
    holds: "INV-M1 — 클라이언트가 실시간 주제로 직접 못 쏜다",
    tag: "남의 화면에 안 닿는다",
    // **undo 를 손으로 적는다.** 이 정책은 어느 마이그레이션도 만들지 않으므로
    // 마이그레이션 재적용만으로는 안 사라진다.
    sql: `drop policy if exists chat_broadcast_write on realtime.messages;
      create policy chat_broadcast_write on realtime.messages for insert to authenticated
        with check (true);`,
    undo: `drop policy if exists chat_broadcast_write on realtime.messages;`,
  },

  // ── 메시지 행에서 무엇을 사람이 정하나 (0021 · INV-M1~M5) ─────────────
  // 강제 장치 하나마다 변이 하나다. 갈래를 묶어 빼면 그중 하나만 붙들려 있어도
  // 「잡혔다」가 나오고, 나머지는 아무도 안 붙드는데 숫자는 만점이 된다.
  "chat-insert-grant-open": {
    holds: "요청이 created_at 을 실을 수 없다",
    tag: "created_at 을 실은",
    // 열 목록을 통째로 없애 표 전체에 삽입 권한을 준다 — 0021 이전 상태다.
    sql: `revoke insert on public.chat_messages from authenticated;
      grant insert on public.chat_messages to authenticated;`,
  },
  "chat-insert-grant-allows-id": {
    holds: "요청이 메시지 id 를 정할 수 없다",
    tag: "id 를 직접 지정한",
    // created_at 은 그대로 막고 id 만 연다. 위 변이와 갈래가 다르다 —
    // 「시각을 못 정한다」와 「id 를 못 정한다」는 서로 다른 검사가 붙들어야 한다.
    sql: `revoke insert on public.chat_messages from authenticated;
      grant insert (id, chat_id, sender_id, content) on public.chat_messages to authenticated;`,
  },
  "chat-insert-grant-drops-content": {
    holds: "허용된 열 셋은 그대로 들어간다",
    tag: "허용된 열 셋만",
    // 반대 절반이다. 열을 지나치게 좁히면 채팅이 아예 안 되는데, 거부 경로만 보는
    // 검사는 그 상태에서도 전부 초록불이다.
    sql: `revoke insert on public.chat_messages from authenticated;
      grant insert (chat_id, sender_id) on public.chat_messages to authenticated;`,
  },
  "chat-insert-policy-open": {
    holds: "방 멤버가 아니면 삽입이 거부된다",
    tag: "방 멤버가 아니면",
    // 권한과 정책은 다른 층이다. 열을 좁히다 정책을 지워도 위 세 변이는 안 잡는다.
    sql: `drop policy if exists messages_send_member on public.chat_messages;
      create policy messages_send_member on public.chat_messages for insert
        with check (sender_id = (select auth.uid()));`,
  },
  "chat-content-uncapped": {
    holds: "메시지 본문의 상한이 앱과 같은 값이다",
    // 이름표에 숫자를 안 넣는다 — `chat-length-loosened` 변이가 상한 자체를 바꾸면
    // 검사 이름의 숫자도 같이 바뀌어 이름표가 안 맞는다(2026-09-10 실측: 「2000자는」으로
    // 뒀더니 검사는 제대로 빨간불이 났는데 판정이 「엉뚱한 빨간불」로 나왔다).
    tag: "한 글자 넘기면",
    sql: `alter table public.chat_messages drop constraint if exists chat_messages_content_length;
      alter table public.chat_messages add constraint chat_messages_content_length
        check (char_length(content) <= 20000 and btrim(content) <> '');`,
  },
  "chat-content-allows-blank": {
    holds: "공백뿐인 본문도 데이터베이스가 거부한다",
    tag: "공백만으로 된",
    // 길이만 보는 모양으로 되돌린다. `char_length('   ')` 는 3이라 통과한다.
    sql: `alter table public.chat_messages drop constraint if exists chat_messages_content_length;
      alter table public.chat_messages add constraint chat_messages_content_length
        check (char_length(content) <= 2000);`,
  },
  "chat-content-allows-control": {
    holds: "제어문자가 든 본문은 데이터베이스가 거부한다",
    tag: "줄바꿈이 든",
    sql: `alter table public.chat_messages drop constraint if exists chat_messages_content_no_control;`,
  },
  "chat-content-newline-only": {
    holds: "줄바꿈 말고 다른 제어문자도 거부된다",
    tag: "다른 제어문자도",
    // 「제어문자를 막는다」를 「줄바꿈만 막는다」로 좁힌다. 줄바꿈 검사 하나만 있으면
    // 이 변이가 그대로 빠져나간다.
    sql: `alter table public.chat_messages drop constraint if exists chat_messages_content_no_control;
      alter table public.chat_messages add constraint chat_messages_content_no_control
        check (content !~ E'\n');`,
  },
  "chat-content-rejects-everything": {
    holds: "평범한 한 줄은 그대로 들어간다",
    tag: "평범한 한 줄은",
    // 반대 절반. 제약을 「전부 거부」로 잘못 써도 위 셋은 초록불이다.
    //
    // **`not valid` 로 건다.** 그냥 걸면 이미 들어 있는 행이 전부 위반이라 `add constraint`
    // 자체가 서고, 그러면 「변이를 심지 못했다」로 판정 불가가 된다 — 검사가 무엇을
    // 붙들고 있는지가 아니라 데이터베이스에 무엇이 남아 있었는지가 결과를 정하게 된다
    // (2026-09-10 실측). `not valid` 는 기존 행을 안 보고 새 삽입에만 건다.
    sql: `alter table public.chat_messages drop constraint if exists chat_messages_content_no_control;
      alter table public.chat_messages add constraint chat_messages_content_no_control
        check (content ~ '^$') not valid;`,
  },
  "chat-insert-grant-allows-created-at": {
    holds: "요청이 created_at 을 실을 수 없다",
    tag: "created_at 을 실은",
    // 표 전체를 여는 변이(`chat-insert-grant-open`)와 갈래가 다르다 — 이건 열 목록에
    // 한 열만 더한다. 목록을 손대는 변경이 통째로 여는 것보다 훨씬 흔하다.
    sql: `revoke insert on public.chat_messages from authenticated;
      grant insert (chat_id, sender_id, content, created_at) on public.chat_messages to authenticated;`,
  },
  "chat-insert-anon-restored": {
    holds: "비로그인에는 삽입 권한이 없다",
    tag: "권한에 대고",
    // **행동으로는 못 잡는 변이다.** 삽입 정책이 `sender_id = auth.uid()` 를 보는데
    // 비로그인은 그 값이 null 이라 정책이 대신 거부한다. 권한 목록을 직접 묻는 검사만
    // 이것을 붙든다.
    sql: `grant insert (chat_id, sender_id, content) on public.chat_messages to anon;`,
    undo: `revoke insert on public.chat_messages from anon;`,
  },
  "chat-content-allows-wide-blank": {
    holds: "눈에 안 보이는 다른 공백만으로 된 본문도 거부된다",
    tag: "눈에 안 보이는 다른 공백",
    // `btrim` 으로 되돌린다. 인자 하나짜리 `btrim` 은 U+0020 만 자르므로 전각 공백·
    // 줄바꿈 없는 공백·BOM 으로만 된 본문이 통과한다(0010 이 이름에서 실측한 함정).
    sql: `alter table public.chat_messages drop constraint if exists chat_messages_content_length;
      alter table public.chat_messages add constraint chat_messages_content_length
        check (char_length(content) <= 2000 and btrim(content) <> '');`,
  },
  "chat-messages-update-privilege-restored": {
    holds: "이 표에 갱신·삭제 권한이 남아 있지 않다",
    tag: "갱신·삭제 권한이",
    // 오늘 동작을 안 바꾸는 방벽이라 행동 검사로는 못 잰다 — 권한 목록 단언만 잡는다.
    sql: `grant update, delete on public.chat_messages to authenticated;`,
    undo: `revoke update, delete on public.chat_messages from anon, authenticated;`,
  },

  "chat-read-stamp-skips-existing": {
    holds: "두 번째 읽음 표시는 시각을 앞으로 민다",
    tag: "앞으로 민다",
    // 「이미 값이 있으면 그대로 둔다」. 첫 읽음은 통과하고 그 뒤로 시각이 멈춘다 —
    // 그 방은 한 번 읽은 뒤로 새 메시지가 영원히 안 읽음으로 남는다. 위 둘과 갈래가
    // 다르므로 이름표도 따로 단다.
    sql: `create or replace function public.stamp_chat_read_at() returns trigger
      language plpgsql set search_path = '' as $fn$
      begin
        new.last_read_at := pg_catalog.coalesce(old.last_read_at, pg_catalog.now());
        return new;
      end;
      $fn$;`,
  },
  "chat-read-stamp-dropped": {
    holds: "읽음 시각을 데이터베이스가 찍는다",
    tag: "미래를 실어도",
    // 트리거를 떼면 앱이 보낸 값이 그대로 저장된다 — 지금 앱은 null 을 보내므로
    // last_read_at 이 null 이 되고, 그 방의 모든 메시지가 안 읽음으로 보인다.
    sql: `drop trigger if exists chat_participants_stamp_read on public.chat_participants;`,
  },
  "chat-read-stamp-conditional": {
    holds: "앱이 보내는 자리 표시로 눌러도 시각이 찍힌다",
    // 이름표가 **null 로 누르는 검사**다. 미래 시각을 실은 검사는 이 변이를 못 잡는다 —
    // 그쪽은 값이 달라지므로 좁힌 조건을 그대로 통과한다.
    tag: "자리 표시",
    // 「값이 달라졌을 때만 찍는다」로 좁힌다. 앱이 보내는 값이 null 이고 아직 안 읽은
    // 방의 저장된 값도 null 이라, 아무 일도 안 하는 갈래를 지나는 것이 **모든 방의 첫
    // 읽음**이다 — 읽어도 값이 null 로 남아 그 방 전체가 영원히 안 읽음으로 보인다.
    sql: `create or replace function public.stamp_chat_read_at() returns trigger
      language plpgsql set search_path = '' as $fn$
      begin
        if new.last_read_at is distinct from old.last_read_at then
          new.last_read_at := pg_catalog.now();
        end if;
        return new;
      end;
      $fn$;`,
  },
  "chat-messages-update-open": {
    holds: "저장된 메시지는 고칠 수 없다",
    // 이름표가 S5 가 아니라 **정책 목록 검사(S5c)** 다. 0021 이 갱신 권한을 거둔 뒤로
    // S5 는 「오류가 왔거나 0행」을 보므로, 정책만 열리면 42501 이 와서 그대로 통과한다.
    // 이 변이를 붙드는 것은 「정책은 읽기와 넣기 둘뿐이다」 하나다.
    tag: "읽기와 넣기 둘뿐이다",
    // INV-M5 를 지키는 것은 「정책이 없음」이다. 없음은 눈에 안 보이므로, 나중에 메시지
    // 수정 기능을 만들며 이 한 줄을 더하면 규칙이 소리 없이 사라진다.
    sql: `drop policy if exists messages_edit_own on public.chat_messages;
      create policy messages_edit_own on public.chat_messages for update
        using (sender_id = (select auth.uid())) with check (sender_id = (select auth.uid()));`,
    // **undo 를 손으로 적는다.** 이 변이가 만드는 것은 0021 이 만들지 않는 정책이라
    // 마이그레이션 재적용으로는 안 없어진다 — INV-M5 를 지키는 것이 「없음」이기 때문이다.
    undo: `drop policy if exists messages_edit_own on public.chat_messages;`,
  },
  "chat-messages-delete-open": {
    holds: "저장된 메시지는 지울 수 없다",
    tag: "읽기와 넣기 둘뿐이다",
    sql: `drop policy if exists messages_delete_own on public.chat_messages;
      create policy messages_delete_own on public.chat_messages for delete
        using (sender_id = (select auth.uid()));`,
    undo: `drop policy if exists messages_delete_own on public.chat_messages;`,
  },

  // ── 남이 쓴 글자 두르기 (design-rules 2026-09-09) ──────────────────────
  //
  // 시각 결정이라 스펙 INV 가 없다. 이름표는 검사 이름 조각을 쓴다.
  "quote-marks-removed": {
    holds: "알림 문장이 남이 쓴 제목을 낫표로 두른다",
    tag: "제품 안내문을 흉내",
    suite: "unit",
    file: {
      path: "src/widgets/site-header/ui/NotificationBell.tsx",
      find: `        {open}`,
      replace: `        {""}`,
    },
  },
  "quote-inside-bold": {
    holds: "낫표는 굵게 밖에 있다 — 취소선이 이름에만 걸리는 근거다",
    tag: "굵게 밖에",
    suite: "unit",
    file: {
      path: "src/widgets/site-header/ui/NotificationBell.tsx",
      find: `        <bdi className={styles.name}>{body}</bdi>`,
      replace: `        <bdi className={styles.name}>{open + body + close}</bdi>`,
    },
  },
  "quote-inner-kept": {
    holds: "두른 글자 안에서는 같은 기호가 안 나온다",
    tag: "겹낫표로",
    suite: "unit",
    // 안쪽 기호를 그대로 두면 호스트가 제목으로 제품의 경계를 흉내 낼 수 있다.
    file: {
      path: "src/shared/lib/quote.ts",
      find: `    body: text.replace(/[「」]/g, (c) => INNER[c] ?? c),`,
      replace: `    body: text,`,
    },
  },
  "quote-truncates": {
    holds: "화면은 저장된 제목을 자르지 않는다 (INV-N6)",
    tag: "안 잘린다",
    suite: "unit",
    file: {
      path: "src/widgets/site-header/ui/NotificationBell.tsx",
      find: `        <bdi className={styles.name}>{body}</bdi>`,
      replace: `        <bdi className={styles.name}>{body.slice(0, 20)}</bdi>`,
    },
  },
  "quote-aria-unquoted": {
    holds: "낭독기가 읽는 이름과 보이는 문장이 같은 조립을 지난다",
    tag: "삭제 단추의 이름",
    suite: "unit",
    file: {
      path: "src/widgets/site-header/ui/NotificationBell.tsx",
      find: '          aria-label={`알림 삭제: ${quoteUserText(subject)}${tail}`}',
      replace: '          aria-label={`알림 삭제: ${subject}${tail}`}',
    },
  },
  "p6-computed-adds-deadline": {
    holds: "INV-P6 — 마감일이 지나도 계산 컬럼은 모집 중이라고 답한다",
    // **넣는 변이다.** 보통 변이는 강제 장치를 빼는데, 이 조항이 금지하는 것은
    // 「마감일을 모집 상태에 넣는 것」이라 빼는 방향으로는 어길 수 없다.
    sql: `
      create or replace function public.recruiting(public.studies) returns boolean
      language sql stable security definer set search_path = '' as $fn$
        select $1.closed_at is null
           and $1.deleted_at is null
           and ($1.recruit_until is null or $1.recruit_until >= current_date)
           and public.accepted_count($1) < $1.max_participants;
      $fn$;`,
  },
  "p6-rpc-adds-deadline": {
    holds: "INV-P6 — 마감일이 지나도 study_is_recruiting 은 참으로 답한다",
    // 같은 조항의 다른 한 벌. 두 벌이 따로 있으니 변이도 따로 있어야 한다.
    sql: `
      create or replace function private.study_is_recruiting(p_study_id uuid) returns boolean
      language sql stable security definer set search_path = '' as $fn$
        select s.closed_at is null
           and s.deleted_at is null
           and (s.recruit_until is null or s.recruit_until >= current_date)
           and private.study_accepted_count(s.id) < s.max_participants
          from public.studies s where s.id = p_study_id;
      $fn$;`,
  },
  "p4-deadline-blocks-accept": {
    holds: "INV-P4 — 마감일이 지난 스터디도 신청과 수락이 그대로 지나간다",
    // 파생값이 아니라 **쓰기 경로**에 마감일을 넣는다. 파생값 쪽만 붙들면 이 모양이
    // 빠져나가고, 그때 사용자는 「모집중」을 보고 신청했다가 거부당한다.
    sql: `
      create or replace function public.enforce_study_capacity() returns trigger
      language plpgsql security definer set search_path = '' as $fn$
      declare
        v_max smallint; v_accepted integer; v_closed timestamptz;
        v_deleted timestamptz; v_until date;
      begin
        if new.status <> 'accepted' then return new; end if;
        select max_participants, closed_at, deleted_at, recruit_until
          into v_max, v_closed, v_deleted, v_until
          from public.studies where id = new.study_id for update;
        if not found then
          raise exception '스터디를 찾을 수 없어 수락할 수 없습니다 (INV-P4)' using errcode = 'check_violation';
        end if;
        if v_deleted is not null then
          raise exception '지워진 스터디에는 참여자를 수락할 수 없습니다 (INV-Z10)' using errcode = 'check_violation';
        end if;
        if v_closed is not null then
          raise exception '모집이 마감된 스터디에는 참여자를 수락할 수 없습니다 (INV-P4)' using errcode = 'check_violation';
        end if;
        if v_until is not null and v_until < current_date then
          raise exception '모집 마감일이 지났습니다 (INV-P4)' using errcode = 'check_violation';
        end if;
        select count(*) into v_accepted
          from public.participants where study_id = new.study_id and status = 'accepted';
        if v_accepted > v_max then
          raise exception '정원을 넘겨 수락할 수 없습니다: 정원 %, 수락 % (INV-P1)', v_max, v_accepted
            using errcode = 'check_violation';
        end if;
        return new;
      end;
      $fn$;`,
  },
  "local-guard-by-prefix": {
    holds: "통합 스위트는 로컬에만 붙는다",
    tag: "로컬",
    // 판정을 파싱에서 문자열 패턴으로 되돌린다. `http://localhost:54321@evil.com` 이
    // 통과하게 되는데, 그 요청에는 secret 키가 실린다.
    // 이 파일은 줄끝이 CRLF 다. 여러 줄을 find 로 잡으면 개행이 안 맞아 못 찾으므로
    // **한 줄만** 잡는다(그 한 줄이 파일에서 유일하다).
    file: {
      path: "tests/integration/helpers.ts",
      find: `    if (u.username || u.password) return url.startsWith("postgresql://") && LOCAL_HOSTS.has(u.hostname);`,
      replace: `    if (u.username || u.password) return /(127\\.0\\.0\\.1|localhost)/.test(url);`,
    },
  },
  "local-guard-ignores-query-host": {
    holds: "통합 스위트는 로컬에만 붙는다 — 질의 매개변수도 본다",
    tag: "질의 매개변수가 호스트를 덮어쓰는",
    // **`new URL().hostname` 이 로컬이어도 pg 는 다른 곳에 붙는다.** 접속 문자열 파서가
    // 질의 매개변수를 URL 의 호스트 위에 덮어쓴다(2026-09-11 실측 · security-reviewer).
    // 이 한 줄을 지우면 `?host=evil.example` 이 통과하고, 그 연결에 슈퍼유저 자격이 실린다.
    file: {
      path: "tests/integration/helpers.ts",
      find: `    if ([...u.searchParams.keys()].some((k) => HOST_DECIDING_PARAMS.has(k.toLowerCase()))) return false;`,
      replace: `    if (false) return false;`,
    },
  },
  "local-guard-rejects-any-query": {
    holds: "호스트를 안 바꾸는 매개변수는 그대로 통과한다",
    tag: "호스트를 안 바꾸는 매개변수",
    // 반대 방향 — **넓히는 쪽**. 질의가 하나라도 있으면 거부하게 만들면 위 검사는 전부
    // 통과하는데 `?sslmode=disable` 같은 멀쩡한 주소가 막힌다.
    file: {
      path: "tests/integration/helpers.ts",
      find: `    if ([...u.searchParams.keys()].some((k) => HOST_DECIDING_PARAMS.has(k.toLowerCase()))) return false;`,
      replace: `    if ([...u.searchParams.keys()].length > 0) return false;`,
    },
  },
  "z9-any-study": {
    holds: "INV-Z9 (S10) — 호스트가 아닌 사람은 남의 스터디에 모집글을 못 붙인다",
    sql: `
      drop policy if exists posts_insert_author on public.posts;
      create policy posts_insert_author on public.posts for insert
        with check (author_id = (select auth.uid()));`,
  },
  "z10-accept-deleted": {
    holds: "INV-Z10 (S11) — 지워진 스터디의 신청은 수락되지 않는다",
    sql: `
      create or replace function public.enforce_study_capacity() returns trigger
      language plpgsql security definer set search_path = '' as $fn$
      declare v_max smallint; v_accepted integer; v_closed timestamptz;
      begin
        if new.status <> 'accepted' then return new; end if;
        select max_participants, closed_at into v_max, v_closed
          from public.studies where id = new.study_id for update;
        if v_closed is not null then
          raise exception '마감' using errcode = 'check_violation';
        end if;
        select count(*) into v_accepted from public.participants
         where study_id = new.study_id and status = 'accepted';
        if v_accepted > v_max then
          raise exception '정원 초과' using errcode = 'check_violation';
        end if;
        return new;
      end; $fn$;`,
  },
  "z10-posts-read-open": {
    holds: "INV-Z10 — 지워진 스터디의 모집글은 목록에 안 나온다",
    sql: `
      drop policy if exists posts_read on public.posts;
      create policy posts_read on public.posts for select using (true);`,
  },
  "z10-apply-deleted": {
    holds: "INV-Z10 — 지워진 스터디에는 새 신청이 안 들어간다",
    sql: `
      drop policy if exists participants_apply_self on public.participants;
      create policy participants_apply_self on public.participants for insert
        with check (user_id = (select auth.uid()) and status = 'pending');`,
  },
  // -- 스터디 수정의 경계 (INV-Z15 · Z16, 0017) ----------------------------
  // 갈래마다 따로 둔다. 스터디 행과 딸린 요일·시간은 **강제 장치가 다르므로**, 한 변이로
  // 묶으면 뒤쪽이 통째로 열려 있어도 앞쪽 검사 덕에 「잡혔다」가 나온다.

  "z15-studies-update-any-host": {
    holds: "INV-Z15 — 남의 스터디는 못 고친다",
    // 이름표를 S22 로 좁힌다. `INV-Z15` 로 두면 요일·시간 갈래(S22d)의 검사가 잡아도
    // 「잡혔다」가 나와서, 스터디 행 쪽이 통째로 열린 상태를 못 가른다.
    tag: "S22)",
    sql: `
      drop policy if exists studies_update_host on public.studies;
      create policy studies_update_host on public.studies for update
        using (deleted_at is null) with check (true);`,
  },
  "z15-sessions-write-any-host": {
    holds: "INV-Z15 — 남의 스터디에는 요일·시간을 못 넣는다",
    tag: "S22d",
    sql: `
      drop policy if exists sessions_write_host on public.study_sessions;
      create policy sessions_write_host on public.study_sessions for insert
        with check (true);`,
  },
  // 지우기 정책만 여는 변이가 없었다 — 넣기 쪽 변이 하나로 두 정책을 함께 판정하고 있었다
  // (2026-09-07 security-reviewer · test-auditor). 이름표도 따로 단다.
  "z15-sessions-del-any-host": {
    holds: "INV-Z15 — 남의 스터디의 요일·시간을 못 지운다",
    tag: "S22e",
    sql: `
      drop policy if exists sessions_del_host on public.study_sessions;
      create policy sessions_del_host on public.study_sessions for delete
        using (true);`,
  },
  "z16-studies-update-deleted": {
    holds: "INV-Z16 — 지워진 스터디는 더 이상 갱신되지 않는다 (되살리기 포함)",
    tag: "S23)",
    sql: `
      drop policy if exists studies_update_host on public.studies;
      create policy studies_update_host on public.studies for update
        using (host_id = (select auth.uid())) with check (host_id = (select auth.uid()));`,
  },
  "z16-with-check-blocks-delete": {
    holds: "INV-Z16 — 삭제 자신은 갱신이므로 통과해야 한다 (반대 절반)",
    // **이것이 「막는 것」과 「너무 막는 것」을 가르는 자리다.** 조건을 with check 에 넣으면
    // 지워진 스터디의 갱신도 막히지만 **삭제 자신도 같이 막힌다** — 실패경로 검사 셋은
    // 전부 초록불인 채로 제품에서는 스터디를 아무도 못 지우게 된다.
    tag: "S23d",
    sql: `
      drop policy if exists studies_update_host on public.studies;
      create policy studies_update_host on public.studies for update
        using (host_id = (select auth.uid()) and deleted_at is null)
        with check (host_id = (select auth.uid()) and deleted_at is null);`,
  },
  // 0017 이전의 상태 그대로다. `private.is_study_host` 는 삭제 표시를 아예 안 본다.
  // **넣기와 지우기를 갈라 둔다** — 한 변이로 둘을 함께 되돌리면 그중 하나만 붙들려 있어도
  // 「잡혔다」가 나온다 (2026-09-07 test-auditor).
  "z16-sessions-write-ignores-deleted": {
    holds: "INV-Z16 — 지워진 스터디에 요일·시간을 못 넣는다",
    tag: "S23c",
    sql: `
      drop policy if exists sessions_write_host on public.study_sessions;
      create policy sessions_write_host on public.study_sessions for insert
        with check (private.is_study_host(study_id, (select auth.uid())));`,
  },
  "z16-sessions-del-ignores-deleted": {
    holds: "INV-Z16 — 지워진 스터디의 요일·시간을 못 지운다",
    tag: "S23f",
    sql: `
      drop policy if exists sessions_del_host on public.study_sessions;
      create policy sessions_del_host on public.study_sessions for delete
        using (private.is_study_host(study_id, (select auth.uid())));`,
  },

  "z17-sessions-read-open": {
    holds: "INV-Z17 — 지워진 스터디의 요일·시간은 그 스터디를 볼 수 있는 사람에게만 보인다",
    tag: "S24)",
    // 0018 이전의 상태 그대로다. 조회만 열려 있으면 제목·설명은 안 나가도
    // **스터디 id 와 모이는 요일·시각**은 비로그인에게 통째로 나간다.
    sql: `
      drop policy if exists sessions_read on public.study_sessions;
      create policy sessions_read on public.study_sessions for select using (true);`,
  },
  "z17-sessions-read-logged-in-only": {
    holds: "INV-Z17(반대 절반) — 좁히는 것과 뺏는 것은 다르다",
    tag: "S24b",
    // 「지워진 것을 감춘다」를 「로그인한 사람만 본다」로 잘못 좁힌 상태. 실패경로 검사는
    // 그대로 초록불인데, 그 제품은 **비로그인에게 모집글의 요일·시간이 통째로 사라진다.**
    sql: `
      drop policy if exists sessions_read on public.study_sessions;
      create policy sessions_read on public.study_sessions for select
        using ((select auth.uid()) is not null);`,
  },
  "z17-sessions-read-hides-from-host": {
    holds: "INV-Z17(반대 절반) — 호스트는 자기가 지운 스터디의 요일·시간을 계속 본다",
    tag: "S24c",
    // 「안 지워졌을 것」만 보면 호스트 갈래가 빠진다. INV-Z11 이 정한 「호스트는 자기가 지운
    // 스터디의 명단과 모집글을 계속 본다」와 어긋나고, 수정 화면의 판독기도 빈 일정을 받는다.
    sql: `
      drop policy if exists sessions_read on public.study_sessions;
      create policy sessions_read on public.study_sessions for select
        using (exists (select 1 from public.studies s
                        where s.id = study_id and s.deleted_at is null));`,
  },

  "z14-post-insert-not-recruiting": {
    holds: "INV-Z14 — 모집 중이 아닌 스터디에는 새 모집글이 안 들어간다",
    sql: `
      drop policy if exists posts_insert_author on public.posts;
      create policy posts_insert_author on public.posts for insert
        with check (
          author_id = (select auth.uid())
          and private.is_study_host(study_id, (select auth.uid()))
        );`,
  },
  "e3-write-path-any": {
    // 이름표를 손으로 적는다 — 아바타 정책의 조건 슬롯이 여섯이라 기본 이름표(INV-E3)로는
    // 어느 갈래가 깨졌는지 판정이 못 가른다
    tag: "INV-E3(경로",
    holds: "INV-E3(경로) — 아바타는 자기 아이디 폴더 아래에만 올라간다",
    sql: `
      drop policy if exists avatars_write_self on storage.objects;
      create policy avatars_write_self on storage.objects for insert
        with check (bucket_id = 'avatars' and owner_id = (select auth.uid())::text);`,
  },
  "e4-bucket-any-mime": {
    tag: "INV-E4(형식",
    holds: "INV-E4(형식) — 아바타 버킷은 이미지라고 신고된 것만 받는다",
    sql: `update storage.buckets set allowed_mime_types = null where id = 'avatars';`,
  },
  "e4-bucket-any-size": {
    tag: "INV-E4(크기",
    holds: "INV-E4(크기) — 아바타 버킷은 정해진 크기까지만 받는다",
    sql: `update storage.buckets set file_size_limit = null where id = 'avatars';`,
  },
  "e5-drop-region-fkey": {
    holds: "INV-E5 — 프로필의 지역은 고정 목록의 값이거나 비어 있다",
    sql: `alter table public.profiles drop constraint if exists profiles_region_fkey;`,
  },
  "e3-read-list-open": {
    holds: "INV-E7 — 아바타 목록은 자기 것만 보인다(폴더 이름이 곧 회원 id 명부다)",
    sql: `
      drop policy if exists avatars_read on storage.objects;
      create policy avatars_read on storage.objects for select
        using (bucket_id = 'avatars');`,
  },
  "z11-members-hidden": {
    holds: "INV-Z11 (S12) — 수락된 멤버는 같은 스터디의 수락된 사람들을 본다",
    sql: `
      drop policy if exists participants_read on public.participants;
      create policy participants_read on public.participants for select
        using (user_id = (select auth.uid())
               or private.is_study_host(study_id, (select auth.uid())));`,
  },
  "z11-members-wide-open": {
    holds: "INV-Z11 (S13) — 관계 없는 사람에게는 하나도 안 보인다",
    sql: `
      drop policy if exists participants_read on public.participants;
      create policy participants_read on public.participants for select using (true);`,
  },
  "z11-pending-leaks": {
    holds: "INV-Z11 — 대기·거절 행은 멤버에게 새지 않는다",
    sql: `
      drop policy if exists participants_read on public.participants;
      create policy participants_read on public.participants for select
        using (user_id = (select auth.uid())
               or private.is_study_host(study_id, (select auth.uid()))
               or private.is_study_member(study_id, (select auth.uid())));`,
  },

  // ── 서버 액션의 가드·판정 (유닛 스위트) ────────────────────────────────
  // 2026-09-06 에 붙인 검사들이 실제로 무엇을 붙드는지 보는 변이다. 그 전까지 이 네 파일
  // (액션 다섯)에는 검사가 0개였고, requireSession 을 통째로 빼도 전 스위트가 초록불이었다.
  //
  // **suite 를 unit 으로 적는다.** 여기서 붙드는 것은 데이터베이스가 아니라 우리가 보내는
  // 문장과 가드의 유무라, 통합 스위트에는 이것을 볼 검사가 아예 없다 — 통합으로 돌리면
  // 「빠져나갔다」가 나오는데 그건 잡을 검사가 없다는 뜻이 아니라 안 돌렸다는 뜻이다.
  //
  // **조립 안의 가드와 액션 파일의 호출부를 따로 찍는다.** 앞의 것만 있으면 액션 파일이
  // make*() 에 가짜 판독기를 끼우도록 바뀌어도 전부 초록불이다 — 세션 가드가 프로덕션
  // 경로에서만 빠지는 상태가 만점으로 나온다 (2026-09-06 code-reviewer · test-auditor).

  "apply-guard-dropped": {
    holds: "INV-A4 — 참가 신청은 세션이 없으면 아무것도 쓰지 않는다",
    suite: "unit",
    file: {
      path: "src/features/apply-to-study/api/insert-application.ts",
      find: `  const guarded = requireSession(readUser, (user, studyId: string) =>`,
      replace: `  const guarded = requireSession((async () => ({ id: "00000000-0000-4000-8000-000000000000" })), (user, studyId: string) =>`,
    },
  },
  "apply-action-unguarded": {
    holds: "INV-A4 — 배포되는 신청 액션이 가드를 거친다",
    suite: "unit",
    file: {
      path: "src/features/apply-to-study/api/apply.ts",
      find: `const guarded = makeApply();`,
      replace: `const guarded = makeApply((async () => ({ id: "00000000-0000-4000-8000-000000000000" })));`,
    },
  },
  "apply-revalidate-dropped": {
    holds: "신청이 성공하면 그 모집글 화면의 캐시를 지운다",
    tag: "캐시를 지운다",
    suite: "unit",
    file: {
      path: "src/features/apply-to-study/api/insert-application.ts",
      find: `    if (result.ok) deps.revalidate("/posts", form.get("postId"));`,
      replace: `    if (result.ok && false) deps.revalidate("/posts", form.get("postId"));`,
    },
  },
  "apply-study-id-dropped": {
    holds: "신청 행에 어느 스터디인지가 실제로 담긴다",
    tag: "정확히 세 칸",
    suite: "unit",
    // study_id 를 빼면 not null 위반으로 기능이 100% 죽는데, user_id 만 보는 단언은 초록불이다.
    file: {
      path: "src/features/apply-to-study/api/insert-application.ts",
      find: `    .insert({ study_id: studyId, user_id: user.id, status: "pending" });`,
      replace: `    .insert({ user_id: user.id, status: "pending" });`,
    },
  },
  "apply-db-error-swallowed": {
    holds: "23505·42501 이 아닌 거부도 실패로 돌려주고 원문을 화면에 안 보낸다",
    tag: "원문을 화면으로 보내지 않는다",
    suite: "unit",
    file: {
      path: "src/features/apply-to-study/api/insert-application.ts",
      find: `    return { ok: false, message: dbErrorMessage("신청", error) };`,
      replace: `    return { ok: true, value: null };`,
    },
  },

  "manage-guard-dropped": {
    holds: "INV-A4 — 참여 상태 변경은 세션이 없으면 아무것도 쓰지 않는다",
    suite: "unit",
    file: {
      path: "src/features/manage-participants/api/change-status.ts",
      find: `  const guarded = requireSession(readUser, (user, input: Parameters<typeof changeStatus>[1]) =>`,
      replace: `  const guarded = requireSession((async () => ({ id: "00000000-0000-4000-8000-000000000000" })), (user, input: Parameters<typeof changeStatus>[1]) =>`,
    },
  },
  "manage-action-unguarded": {
    holds: "INV-A4 — 배포되는 상태 변경 액션이 가드를 거친다",
    suite: "unit",
    file: {
      path: "src/features/manage-participants/api/manage.ts",
      find: `const guarded = makeChangeParticipation();`,
      replace: `const guarded = makeChangeParticipation((async () => ({ id: "00000000-0000-4000-8000-000000000000" })));`,
    },
  },
  "manage-zero-rows-ok": {
    holds: "정책이 걸러 0행이 갱신된 것을 성공으로 보고하지 않는다",
    tag: "0행",
    suite: "unit",
    file: {
      path: "src/features/manage-participants/api/change-status.ts",
      find: `  if (!data || data.length === 0) {`,
      replace: `  if (data && data.length < 0) {`,
    },
  },
  "manage-db-error-swallowed": {
    holds: "트리거가 지은 한국어 문장을 삼키지 않는다 (정원 초과·지워진 스터디·끝난 신청)",
    tag: "P0001",
    suite: "unit",
    // 이 액션이 받는 오류의 대부분이 P0001 이다. 삼키면 호스트는 「수락했습니다」를 보고
    // 신청자는 영원히 안 들어온다 (2026-09-06 test-auditor: 이 갈래에 검사가 0건이었다).
    file: {
      path: "src/features/manage-participants/api/change-status.ts",
      find: `  if (error) return { ok: false, message: dbErrorMessage(ACTION_NOUN[next], error) };`,
      replace: `  if (error) return { ok: true, value: null };`,
    },
  },
  "manage-withdraw-anyone": {
    holds: "남을 대신 탈퇴시킬 수 없다",
    tag: "대신 탈퇴",
    suite: "unit",
    file: {
      path: "src/features/manage-participants/api/change-status.ts",
      find: `  if (next === "withdrawn" && targetUserId !== user.id) {`,
      replace: `  if (next === "__nevermatches__" && targetUserId !== user.id) {`,
    },
  },
  "manage-transition-open": {
    holds: "INV-P7 — 목록에 없는 전이는 거부한다",
    suite: "unit",
    file: {
      path: "src/features/manage-participants/api/change-status.ts",
      find: `  if (!ALLOWED.includes(next)) return { ok: false, message: "할 수 없는 동작입니다" };`,
      replace: `  if (ALLOWED.includes(next) && false) return { ok: false, message: "할 수 없는 동작입니다" };`,
    },
  },

  "chat-guard-dropped": {
    holds: "INV-A4 — 메시지 보내기는 세션이 없으면 아무것도 쓰지 않는다",
    suite: "unit",
    file: {
      path: "src/features/chat/api/send-message.ts",
      find: `  const guarded = requireSession(readUser, (user, input: { chatId: string; content: string }) =>`,
      replace: `  const guarded = requireSession((async () => ({ id: "00000000-0000-4000-8000-000000000000" })), (user, input: { chatId: string; content: string }) =>`,
    },
  },
  "chat-action-unguarded": {
    holds: "INV-A4 — 배포되는 메시지 액션이 가드를 거친다",
    suite: "unit",
    file: {
      path: "src/features/chat/api/chat-actions.ts",
      find: `const guardedSend = makeSendMessage();`,
      replace: `const guardedSend = makeSendMessage((async () => ({ id: "00000000-0000-4000-8000-000000000000" })));`,
    },
  },
  "markread-action-unguarded": {
    holds: "INV-A4 — 배포되는 읽음 표시 액션이 가드를 거친다",
    suite: "unit",
    file: {
      path: "src/features/chat/api/chat-actions.ts",
      find: `const guardedRead = makeMarkRead();`,
      replace: `const guardedRead = makeMarkRead((async () => ({ id: "00000000-0000-4000-8000-000000000000" })));`,
    },
  },
  "chat-length-loosened": {
    holds: "메시지 길이 상한 2000 이 실제로 걸린다",
    tag: "길이 상한 2000",
    suite: "unit",
    // **MAX_SAFE_INTEGER 로 늘리지 않는다.** 그러면 검사의 repeat 이 RangeError 를 던져서
    // 단언이 아니라 문자열 생성 실패로 빨간불이 난다 — 판정이 거짓이 된다
    // (2026-09-06 test-auditor). 실제로 일어날 모양(상한이 슬쩍 늘어남)으로 찍는다.
    file: {
      path: "src/features/chat/model/limits.ts",
      find: `export const MESSAGE_MAX = 2000;`,
      replace: `export const MESSAGE_MAX = 20000;`,
    },
  },
  "chat-db-error-swallowed": {
    holds: "42501 이 아닌 거부를 삼키지 않는다 — 삼키면 화면은 보냈다고 하고 메시지는 사라진다",
    tag: "삼키지 않는다",
    suite: "unit",
    file: {
      path: "src/features/chat/api/send-message.ts",
      find: `    return { ok: false, message: dbErrorMessage("보내기", error) };`,
      replace: `    return { ok: true, value: null };`,
    },
  },
  "markread-any-user": {
    holds: "읽음 표시는 이 방의 나만 민다",
    tag: "이 방의 나",
    suite: "unit",
    file: {
      path: "src/features/chat/api/mark-read.ts",
      find: `    .eq("user_id", user.id);`,
      replace: `    .eq("chat_id", chatId + "");`,
    },
  },
  "chat-control-guard-dropped": {
    holds: "제어문자가 든 본문은 앱이 먼저 거부한다",
    tag: "제어문자가 든 본문은",
    suite: "unit",
    // 판정을 지우면 본문이 그대로 데이터베이스로 가고, 제약이 23514 로 거부한 것을
    // dbErrorMessage 가 「잠시 뒤 다시 시도해 주세요」로 덮는다 — 다시 시도해도 절대
    // 성공하지 않는데 문구는 기다리라고 한다.
    // **2026-09-11 에 이 줄이 바뀌었는데 find 가 안 따라가 변이가 낡아 있었다.** 그동안
    // 이 변이는 「복구 실패」로 스위트 전체를 멈추게 했고, 제어문자 판정을 붙드는 검사는
    // 아무도 안 재고 있었다. **제어문자 갈래만 지운다** — 서식 문자까지 같이 지우면
    // 그쪽 검사 하나로 이 변이가 「잡혔다」가 된다.
    file: {
      path: "src/features/chat/api/send-message.ts",
      find: `  if (hasControlChars(content) || hasBidiFormatting(content)) {`,
      replace: `  if (hasBidiFormatting(content)) {`,
    },
  },
  "chat-control-guard-rejects-all": {
    holds: "제어문자가 아닌 특수문자는 그대로 보낸다",
    tag: "제어문자가 아닌 특수문자",
    suite: "unit",
    // 반대 절반. 판정을 「전부 거부」로 잘못 써도 위 변이가 붙드는 검사는 초록불이다.
    file: {
      path: "src/features/chat/api/send-message.ts",
      find: `  if (hasControlChars(content) || hasBidiFormatting(content)) {`,
      replace: `  if (content.length > 0) {`,
    },
  },
  "chat-length-code-units": {
    holds: "길이를 코드 포인트로 센다",
    tag: "코드 포인트로 센다",
    suite: "unit",
    // UTF-16 코드 단위로 되돌린다. 이모지 하나가 2로 세져서, 스키마의 char_length 가
    // 받아 줄 메시지를 앱이 먼저 막는다.
    file: {
      path: "src/features/chat/api/send-message.ts",
      find: `  if ([...content].length > MESSAGE_MAX) {`,
      replace: `  if (content.length > MESSAGE_MAX) {`,
    },
  },

  // 옛 변이(`markread-frozen-clock`)는 앱이 시계를 갖고 있을 때의 것이었다 — 기본 시계를
  // 1970년으로 고정했다. 0021 부터 앱은 시각을 아예 안 만들고 데이터베이스가 찍으므로
  // (INV-M2), 고정할 시계가 없다. 대신 **앱이 다시 시각을 만드는 것**이 변이다.
  "markread-app-clock": {
    holds: "INV-M2 — 읽음 시각을 앱이 만들지 않는다",
    suite: "unit",
    file: {
      path: "src/features/chat/api/mark-read.ts",
      find: `const STAMPED_BY_DB = null;`,
      replace: `const STAMPED_BY_DB = new Date().toISOString();`,
    },
  },

  "study-guard-dropped": {
    holds: "INV-A4 — 스터디 개설은 세션이 없으면 아무것도 쓰지 않는다",
    suite: "unit",
    file: {
      path: "src/features/create-study/api/insert-study.ts",
      find: `  return requireSession(readUser, (user, form: FormData) =>`,
      replace: `  return requireSession((async () => ({ id: "00000000-0000-4000-8000-000000000000" })), (user, form: FormData) =>`,
    },
  },
  "study-action-unguarded": {
    holds: "INV-A4 — 배포되는 개설 액션이 가드를 거친다",
    suite: "unit",
    file: {
      path: "src/features/create-study/api/create-study.ts",
      find: `const guarded = makeCreateStudy();`,
      replace: `const guarded = makeCreateStudy((async () => ({ id: "00000000-0000-4000-8000-000000000000" })));`,
    },
  },
  "study-capacity-drifts": {
    holds: "스터디 정원의 상한이 데이터베이스와 같은 숫자다",
    tag: "정원의 경계",
    suite: "unit",
    // 무한대가 아니라 **슬쩍 늘어나는** 모양으로 찍는다. 데이터베이스는 100 에서 거부한다.
    file: {
      path: "src/entities/study/model/limits.ts",
      find: `export const CAPACITY_MAX = 100;`,
      replace: `export const CAPACITY_MAX = 1000;`,
    },
  },
  "study-mode-hardcoded": {
    holds: "고른 진행 방식이 그대로 저장된다",
    tag: "진행 방식",
    suite: "unit",
    file: {
      // 칸 조립은 개설·수정이 함께 보는 entities/study/model/study-form.ts 로 옮겼다 (2026-09-07).
      path: "src/entities/study/model/study-form.ts",
      find: `      meeting_mode: meetingMode as MeetingMode,`,
      replace: `      meeting_mode: "offline" as MeetingMode,`,
    },
  },
  "study-recruit-until-dropped": {
    holds: "모집 마감일이 실제로 저장된다 — 마감 임박순 정렬의 유일한 원천이다",
    tag: "열두 칸",
    suite: "unit",
    file: {
      path: "src/entities/study/model/study-form.ts",
      find: `      recruit_until: recruitUntil,`,
      replace: `      recruit_until: null,`,
    },
  },
  "study-host-from-elsewhere": {
    holds: "INV-Z4 — 스터디의 호스트는 세션에서 온다",
    suite: "unit",
    file: {
      path: "src/features/create-study/api/insert-study.ts",
      find: `    .insert({ host_id: user.id, ...read.fields })`,
      replace: `    .insert({ host_id: "00000000-0000-4000-8000-000000000000", ...read.fields })`,
    },
  },
  "study-raw-error-leaked": {
    holds: "데이터베이스 원문을 화면으로 보내지 않는다 (제약 이름·표 이름 노출)",
    tag: "원문을 화면으로 보내지 않는다",
    suite: "unit",
    file: {
      path: "src/features/create-study/api/insert-study.ts",
      find: `  if (error) return { ok: false, message: dbErrorMessage("스터디 개설", error) };`,
      replace: '  if (error) return { ok: false, message: "스터디를 만들지 못했습니다: " + error.message };',
    },
  },
  "study-slots-first-row-only": {
    holds: "모임 일정 세 줄을 끝까지 읽는다",
    tag: "끝까지 읽는다",
    suite: "unit",
    file: {
      path: "src/entities/study/model/slots.ts",
      find: `  for (let i = 0; i < SLOT_ROWS_MAX; i += 1) {`,
      replace: `  for (let i = 0; i < 1; i += 1) {`,
    },
  },
  "study-slots-time-order-open": {
    holds: "끝 시각이 시작 시각보다 뒤여야 한다",
    tag: "끝 시각이",
    suite: "unit",
    file: {
      path: "src/entities/study/model/slots.ts",
      find: `    if (endsAt <= startsAt) {`,
      replace: `    if (endsAt < "") {`,
    },
  },
  "profile-revalidate-dropped": {
    holds: "프로필 저장이 성공하면 프로필 화면 둘을 다시 받게 한다",
    tag: "다시 받게 한다",
    suite: "unit",
    file: {
      path: "src/features/edit-profile/api/save-profile.ts",
      find: `    if (result.ok) deps.revalidatePaths("/profile", "/profile/edit");`,
      replace: `    if (result.ok && false) deps.revalidatePaths("/profile", "/profile/edit");`,
    },
  },

  // ── 모집글 수정 (유닛 스위트) ──────────────────────────────────────────
  // 갱신은 삽입과 실패 모양이 다르다. 삽입은 정책이 거부하면 오류가 오는데, **갱신은
  // 조건에 안 맞으면 오류 없이 0행이 온다** — 그래서 「남의 글을 고치려 했다」가 조용한
  // 성공으로 보고될 수 있는 자리가 여기 하나 더 있다.

  "study-slots-reads-form-rows-only": {
    holds: "서버가 폼의 기본 줄 수를 넘는 일정 줄도 읽는다",
    tag: "기본 줄 수를 넘는 줄도 읽는다",
    suite: "unit",
    // 이 값을 `SLOT_ROWS` 로 되돌리면 **수정 화면에 보이던 넷째 줄이 제출과 동시에 사라진다**
    // — 수정은 「보낸 줄이 곧 전부」라 안 읽힌 줄은 지워진 줄이 된다.
    file: {
      path: "src/entities/study/model/slots.ts",
      find: `  for (let i = 0; i < SLOT_ROWS_MAX; i += 1) {`,
      replace: `  for (let i = 0; i < SLOT_ROWS; i += 1) {`,
    },
  },
  "study-slot-rows-clamped": {
    holds: "수정 폼이 저장된 일정보다 적은 줄을 그리지 않는다",
    tag: "그만큼 늘린다",
    suite: "unit",
    file: {
      path: "src/entities/study/model/slots.ts",
      find: `  return Math.min(SLOT_ROWS_MAX, Math.max(SLOT_ROWS, savedCount));`,
      replace: `  return SLOT_ROWS;`,
    },
  },

  // -- 스터디 수정 (유닛 스위트) ------------------------------------------
  // 모집글 수정과 실패 모양이 같다(0행은 오류가 아니다). 다른 것은 **일정이 딸려 있다**는
  // 것이고, 그래서 「본문은 저장됐는데 일정만 못 바꾼」 갈래가 하나 더 있다.

  "edit-study-guard-dropped": {
    holds: "INV-A4 — 스터디 수정은 세션이 없으면 아무것도 쓰지 않는다",
    tag: "세션이 없으면 데이터베이스에 손도 대지 않고",
    suite: "unit",
    file: {
      path: "src/features/edit-study/api/update-study.ts",
      find: `  const guarded = requireSession(readUser, (user, form: FormData) =>`,
      replace: `  const guarded = requireSession((async () => ({ id: "00000000-0000-4000-8000-000000000000" })), (user, form: FormData) =>`,
    },
  },
  "edit-study-action-unguarded": {
    holds: "INV-A4 — 배포되는 스터디 수정 액션이 가드를 거친다",
    tag: "세션이 없으면 데이터베이스에 손도 대지 않고",
    suite: "unit",
    file: {
      path: "src/features/edit-study/api/edit-study.ts",
      find: `const guarded = makeUpdateStudy();`,
      replace: `const guarded = makeUpdateStudy((async () => ({ id: "00000000-0000-4000-8000-000000000000" })));`,
    },
  },
  "edit-study-any-host": {
    holds: "INV-Z15 — 갱신 대상을 「내가 여는 스터디」로 좁히는 조건이 실제로 걸린다",
    tag: "「내가 여는 스터디」로 좁힌다",
    suite: "unit",
    // find·replace 를 한 줄로 두는 이유는 모집글 쪽과 같다 — 작업 트리가 CRLF 라
    // 줄을 걸치면 깨끗한 소스에서도 안 맞는다.
    file: {
      path: "src/features/edit-study/api/update-study.ts",
      find: `    .eq("host_id", user.id)`,
      replace: `    .eq("id", studyId) // 변이: 호스트 좁히기 제거`,
    },
  },
  "edit-study-host-from-form": {
    holds: "INV-Z4 — 누구의 스터디인지는 폼이 아니라 세션이 정한다",
    tag: "폼이 아니라 세션이 정한다",
    suite: "unit",
    // 위 변이와 find 가 같지만 갈래가 다르다 — 저것은 좁히기가 통째로 사라지는 것이고
    // 이것은 **폼 값이 인가에 쓰이는** 것이다.
    file: {
      path: "src/features/edit-study/api/update-study.ts",
      find: `    .eq("host_id", user.id)`,
      replace: `    .eq("host_id", (form.get("hostId") as string) ?? user.id)`,
    },
  },
  "edit-study-zero-rows-ok": {
    holds: "INV-Z15 — 0행이 갱신된 것을 성공으로 보고하지 않는다",
    tag: "0행이 오고",
    suite: "unit",
    // 조건이 아니라 **돌려주는 문구**를 바꾼다 — 조건만 끄면 그다음 줄이 null 에서 `.id` 를
    // 읽어 TypeError 를 던지고, 그때 빨간불은 단언이 붙들어서가 아니라 터져서 난 것이다.
    file: {
      path: "src/features/edit-study/api/update-study.ts",
      find: `  if (!data) {`,
      replace: `  if (!data) { return { ok: true, value: { id: studyId, slotError: null, slotsWiped: false } };`,
    },
  },
  "edit-study-carries-host": {
    holds: "INV-Z15 — 갱신에 호스트를 싣지 않는다",
    tag: "정확히 열한 칸",
    suite: "unit",
    // 실으면 데이터베이스의 열 단위 갱신 권한 밖이라 요청이 통째로 거부된다 —
    // 화면은 그대로인데 수정이 100% 죽는다.
    file: {
      path: "src/features/edit-study/api/update-study.ts",
      find: `    .update(read.fields)`,
      replace: `    .update({ ...read.fields, host_id: form.get("hostId") })`,
    },
  },
  "edit-study-revalidate-dropped": {
    holds: "스터디 수정이 성공하면 고친 값이 나오는 화면 다섯을 다시 받게 한다 — 하나만 빠져도 잡힌다",
    tag: "다시 받게",
    suite: "unit",
    file: {
      path: "src/features/edit-study/api/update-study.ts",
      find: '      deps.revalidatePaths(`/studies/${result.value.id}`, "/posts", "/profile", "/", "/chats");',
      replace: '      deps.revalidatePaths(`/studies/${result.value.id}`, "/posts", "/profile", "/chats");',
    },
  },
  "edit-study-value-from-form": {
    holds: "성공 값이 폼의 id 가 아니라 데이터베이스가 돌려준 id 다",
    tag: "돌려준 id 를 값으로 준다",
    suite: "unit",
    file: {
      path: "src/features/edit-study/api/update-study.ts",
      find: `    value: { id: (data as { id: string }).id, slotError: sync.error, slotsWiped: sync.wiped },`,
      replace: `    value: { id: studyId, slotError: sync.error, slotsWiped: sync.wiped },`,
    },
  },
  "edit-study-slots-wipe-all": {
    holds: "모임 일정은 바뀐 줄만 건드린다 — 통째로 갈아치우지 않는다",
    tag: "지우지도 넣지도 않는다",
    suite: "unit",
    // 통째로 갈아치우면 **안 건드린 줄까지 지워졌다가 다시 들어간다.** 그 사이에 넣기가
    // 실패하면 손대지도 않은 일정이 사라진다 — 이 변이가 없으면 그 상태가 초록불이다.
    file: {
      path: "src/features/edit-study/api/update-study.ts",
      find: `  const { toDelete, toInsert } = diffSlots((data ?? []) as SlotRow[], next);`,
      replace: `  const toDelete = (data ?? []) as SlotRow[]; const toInsert = [...next];`,
    },
  },
  "edit-study-slot-error-swallowed": {
    holds: "일정 저장이 실패한 것을 조용히 성공으로 읽지 않는다",
    tag: "무엇이 안 됐는지 같이 온다",
    suite: "unit",
    file: {
      path: "src/features/edit-study/api/update-study.ts",
      find: `  const sync = await syncSlots(supabase, studyId, slots.slots);`,
      replace: `  await syncSlots(supabase, studyId, slots.slots); const sync = { error: null, wiped: false };`,
    },
  },
  // 아래 넷은 이번 리뷰가 「아무도 안 붙들고 있다」고 지목한 갈래들이다 (2026-09-07).
  "edit-study-slots-read-unscoped": {
    holds: "일정을 읽을 때 그 스터디로 좁힌다",
    tag: "일정을 읽을 때 그 스터디로 좁힌다",
    suite: "unit",
    // 조회 정책이 `using (true)` 라, 안 좁히면 **데이터베이스의 모든 스터디 일정**이
    // 돌아오고 그것이 그대로 지울 목록이 된다.
    file: {
      path: "src/features/edit-study/api/update-study.ts",
      // **replace 는 깨끗한 소스에 없는 문장이어야 한다.** 있으면 복구 패스(replace→find)가
      // 손대지도 않은 줄을 바꿔 놓는다 — 2026-09-07 에 이 파일에서 실제로 났다.
      find: `    .eq("study_id", studyId);`,
      replace: `    .not("id", "is", null); // 변이: 스터디 좁히기 제거`,
    },
  },
  "edit-study-slots-delete-unscoped": {
    holds: "일정을 지울 때도 그 스터디로 좁힌다 — 겹쳐 건 방벽이다",
    tag: "일정을 지울 때도 그 스터디로 좁힌다",
    suite: "unit",
    file: {
      path: "src/features/edit-study/api/update-study.ts",
      find: `      .eq("study_id", studyId)`,
      replace: `      .not("id", "is", null) // 변이: 스터디 좁히기 제거`,
    },
  },
  "edit-study-slots-insert-first": {
    holds: "일정은 지우기가 넣기보다 먼저 나간다 — 유일 제약이 요일·시작 시각만 보기 때문이다",
    tag: "지우기가 넣기보다 먼저 나간다",
    suite: "unit",
    // 순서를 뒤집으면 **끝 시각만 바꾼 줄이 영영 안 바뀐다** — 옛 줄이 남아 있어
    // `study_sessions_unique` 에 걸리고, 거기서 반환하므로 지우기는 아예 안 돈다.
    file: {
      path: "src/features/edit-study/api/update-study.ts",
      find: `  if (toDelete.length > 0) {`,
      replace: `  if (toInsert.length > 0) {
    await supabase.from("study_sessions").insert(toInsert.map((s) => ({ ...s, study_id: studyId })));
  }
  if (toDelete.length > 0) {`,
    },
  },
  "edit-study-slot-delete-error-swallowed": {
    holds: "일정 지우기가 실패하면 거기서 멈춘다",
    tag: "넣기는 안 나간다",
    suite: "unit",
    file: {
      path: "src/features/edit-study/api/update-study.ts",
      find: `    if (delError) return { error: dbErrorMessage("모임 일정을 저장", delError), wiped: false };`,
      replace: `    void delError;`,
    },
  },
  "edit-study-slots-wiped-hidden": {
    holds: "지우기까지 끝난 뒤 넣기가 실패한 것을 「일정은 그대로」로 말하지 않는다",
    tag: "지워진 상태라는 것을 값이 말한다",
    suite: "unit",
    file: {
      path: "src/features/edit-study/api/update-study.ts",
      find: `      return { error: dbErrorMessage("모임 일정을 저장", insError), wiped: toDelete.length > 0 };`,
      replace: `      return { error: dbErrorMessage("모임 일정을 저장", insError), wiped: false };`,
    },
  },
  "study-form-date-shape-loose": {
    holds: "날짜 셋의 모양을 보고 통과시킨다",
    tag: "어느 칸인지 말하고 멈춘다",
    suite: "unit",
    // 안 보면 적힌 그대로 Postgres 로 가고, 그 오류 문장이 값을 되비쳐 로그에 찍힌다 —
    // 값 안의 줄바꿈이 살아 있으므로 로그 한 줄을 지어낼 수 있다.
    file: {
      path: "src/entities/study/model/study-form.ts",
      find: `    if (value && !DATE_SHAPE.test(value)) {`,
      replace: `    if (false && value && !DATE_SHAPE.test(value)) {`,
    },
  },
  "study-slot-time-shape-loose": {
    holds: "시각의 모양을 보고 통과시킨다",
    tag: "HH:MM 모양이 아니면",
    suite: "unit",
    // 모양을 안 보면 `"9:00"` 이 통과하고, 아래 글자 순서 비교가 뒤집혀 정상 값이
    // 「끝이 시작보다 앞선다」로 거부된다. 아무 값이나 통과하는 갈래에서는 수정 경로가
    // 지우기를 끝낸 뒤에 데이터베이스에서 거부돼 **있던 일정이 사라진다.**
    file: {
      path: "src/entities/study/model/slots.ts",
      find: `    if (!TIME_SHAPE.test(startsAt) || !TIME_SHAPE.test(endsAt)) {`,
      replace: `    if (false) {`,
    },
  },
  "edit-study-reader-drops-recruit-until": {
    holds: "수정 화면 판독기가 폼이 채우는 칸을 하나도 빠뜨리지 않는다",
    tag: "하나도 빠뜨리지 않고 묻는다",
    suite: "unit",
    // 안 읽은 칸은 폼에서 빈칸이 되고, 수정은 「보낸 것이 곧 전부」라
    // **손대지 않은 모집 마감일이 저장과 동시에 지워진다.**
    file: {
      path: "src/entities/study/api/read-study-for-edit.ts",
      find: `meeting_mode, max_participants, starts_on, ends_on, recruit_until, accepted_count,`,
      replace: `meeting_mode, max_participants, starts_on, ends_on, accepted_count,`,
    },
  },
  "edit-study-form-fixed-rows": {
    holds: "수정 폼이 저장된 일정만큼 줄을 그린다",
    tag: "그만큼 늘려 그린다",
    suite: "unit",
    // 저장된 줄보다 적게 그리면 안 그려진 줄은 제출에 안 실리고, 서버는 「보낸 줄이 곧
    // 전부」로 읽어 그 줄을 지운다 — 화면에 안 보인 것이 저장과 동시에 사라진다.
    file: {
      path: "src/features/edit-study/ui/EditStudyForm.tsx",
      find: `  return Array.from({ length: slotFormRows(slots.length) }, (_, i) => {`,
      replace: `  return Array.from({ length: 3 }, (_, i) => {`,
    },
  },
  "edit-study-form-no-study-id": {
    holds: "수정 폼이 어느 스터디를 고치는지 숨은 칸으로 싣는다",
    tag: "숨은 칸으로 싣는다",
    suite: "unit",
    file: {
      path: "src/features/edit-study/ui/EditStudyForm.tsx",
      find: `        <input type="hidden" name="studyId" value={study.id} />`,
      replace: `        <input type="hidden" name="studyIdX" value={study.id} />`,
    },
  },
  "edit-study-form-capacity-floor-constant": {
    holds: "INV-P3 — 정원 입력칸의 하한이 지금 참여 인원이다",
    tag: "하한이 지금 참여 인원이다",
    suite: "unit",
    file: {
      path: "src/features/edit-study/ui/EditStudyForm.tsx",
      find: `  const floor = capacityFloor(study.filled);`,
      replace: `  const floor = CAPACITY_MIN;`,
    },
  },
  "edit-study-reader-any-host": {
    holds: "INV-Z15 — 수정 화면 판독기가 「내가 여는 스터디」로 좁힌다",
    tag: "「내가 여는 스터디」로 좁혀서 묻는다",
    suite: "unit",
    file: {
      path: "src/entities/study/api/read-study-for-edit.ts",
      find: `    .eq("host_id", userId)`,
      replace: `    .eq("id", studyId) // 변이: 호스트 좁히기 제거`,
    },
  },
  "edit-study-reader-shows-deleted": {
    holds: "INV-Z16 — 지워진 스터디는 수정 화면도 안 연다",
    tag: "지워진 스터디는 수정 화면도",
    suite: "unit",
    file: {
      path: "src/entities/study/api/read-study-for-edit.ts",
      find: `    .is("deleted_at", null)`,
      replace: `    .eq("id", studyId) // 변이: 삭제 표시 필터 제거`,
    },
  },

  "edit-post-guard-dropped": {
    holds: "INV-A4 — 모집글 수정은 세션이 없으면 아무것도 쓰지 않는다",
    suite: "unit",
    file: {
      path: "src/features/edit-post/api/update-post.ts",
      find: `  const guarded = requireSession(readUser, (user, form: FormData) =>`,
      replace: `  const guarded = requireSession((async () => ({ id: "00000000-0000-4000-8000-000000000000" })), (user, form: FormData) =>`,
    },
  },
  "edit-post-action-unguarded": {
    holds: "INV-A4 — 배포되는 모집글 수정 액션이 가드를 거친다",
    suite: "unit",
    file: {
      path: "src/features/edit-post/api/edit-post.ts",
      find: `const guarded = makeUpdatePost();`,
      replace: `const guarded = makeUpdatePost((async () => ({ id: "00000000-0000-4000-8000-000000000000" })));`,
    },
  },
  "edit-post-any-author": {
    holds: "INV-Z3 — 갱신 대상을 「내가 쓴 글」로 좁히는 조건이 실제로 걸린다",
    suite: "unit",
    // 이 줄을 빼도 정책이 두 번째 방벽으로 남지만, 그때 사용자가 보는 것은 우리가 지은
    // 문장이 아니라 고정 문구다. 그리고 방벽이 하나 줄었다는 것을 아무도 안 본다.
    file: {
      path: "src/features/edit-post/api/update-post.ts",
      // **find·replace 는 한 줄로 적는다.** 이 레포는 작업 트리가 CRLF 인데(core.autocrlf)
      // 여기 적는 문자열은 LF 라, 줄을 걸치면 깨끗한 소스에서도 안 맞는다 — 도구는 그것을
      // 「변이가 낡았다」로 보고하고, 고칠 곳을 소스라고 잘못 가리키게 된다.
      //
      // **replace 가 깨끗한 소스에 이미 있는 문장이어도 안 된다.** 되돌리기는 replace 를
      // 전부 find 로 바꾸므로, 처음에 `.eq("id", postId)` 로 적었더니 복구가 바로 위의
      // 멀쩡한 줄까지 바꿔 놓았다(도구가 그 자리에서 잡았다).
      find: `    .eq("author_id", user.id)`,
      replace: `    .eq("id", postId) // 변이: 작성자 좁히기 제거`,
    },
  },
  "edit-post-zero-rows-ok": {
    holds: "INV-Z3 — 0행이 갱신된 것을 성공으로 보고하지 않는다",
    tag: "0행",
    suite: "unit",
    file: {
      path: "src/features/edit-post/api/update-post.ts",
      // 한 줄로 적는 이유는 위 `edit-post-any-author` 와 같다.
      // 조건이 아니라 **돌려주는 값**을 바꾼다 — 조건만 끄면 그다음 줄이 null 에서 `.id` 를
      // 읽어 TypeError 를 던지고, 그때 빨간불은 단언이 붙들어서가 아니라 터져서 난 것이다.
      find: `    return { ok: false, message: "고칠 수 있는 모집글이 아닙니다. 내가 쓴 글인지 확인해 주세요" };`,
      replace: `    return { ok: true, value: postId };`,
    },
  },
  "edit-post-carries-study": {
    holds: "INV-Z8 — 갱신에 스터디·작성자를 싣지 않는다",
    tag: "정확히 세 칸",
    suite: "unit",
    // 실으면 데이터베이스의 열 단위 갱신 권한(title·summary·content) 밖이라 요청이 통째로
    // 거부된다 — 화면은 그대로인데 수정이 100% 죽는다.
    file: {
      path: "src/features/edit-post/api/update-post.ts",
      find: `    .update({ title, summary, content })`,
      replace: `    .update({ title, summary, content, study_id: form.get("studyId") })`,
    },
  },
  "edit-post-revalidate-dropped": {
    holds: "모집글 수정이 성공하면 고친 값이 나오는 화면 넷을 다시 받게 한다 — 하나만 빠져도 잡힌다",
    tag: "다시 받게",
    suite: "unit",
    file: {
      path: "src/features/edit-post/api/update-post.ts",
      find: '    if (result.ok) deps.revalidatePaths(`/posts/${result.value}`, "/posts", "/profile", "/");',
      replace: '    if (result.ok) deps.revalidatePaths(`/posts/${result.value}`, "/posts", "/profile");',
    },
  },
  "edit-post-reader-any-author": {
    holds: "INV-Z3 — 수정 화면 판독기가 「내가 쓴 글」로 좁힌다",
    tag: "내가 쓴 글",
    suite: "unit",
    file: {
      path: "src/entities/post/api/read-post-for-edit.ts",
      find: `    .eq("author_id", userId)`,
      replace: `    .eq("id", postId) // 변이: 작성자 좁히기 제거`,
    },
  },
  "edit-post-reader-shows-deleted": {
    holds: "INV-Z10 — 지워진 스터디의 모집글은 수정 화면도 안 연다",
    tag: "지워진 스터디",
    suite: "unit",
    file: {
      path: "src/entities/post/api/read-post-for-edit.ts",
      find: `    .is("study.deleted_at", null)`,
      replace: `    .eq("id", postId) // 변이: 지워진 스터디 필터 제거`,
    },
  },
  "edit-post-value-from-form": {
    holds: "성공 값이 폼의 id 가 아니라 데이터베이스가 돌려준 id 다",
    tag: "돌려준 id",
    suite: "unit",
    file: {
      path: "src/features/edit-post/api/update-post.ts",
      find: `  return { ok: true, value: (data as { id: string }).id };`,
      replace: `  return { ok: true, value: postId };`,
    },
  },
  "edit-post-author-from-form": {
    holds: "INV-Z4 — 누구의 글인지는 폼이 아니라 세션이 정한다",
    tag: "폼이 아니라 세션",
    suite: "unit",
    // `edit-post-any-author` 와 find 가 같지만 갈래가 다르다 — 저것은 좁히기가 통째로
    // 사라지는 것이고 이것은 **폼 값이 인가에 쓰이는** 것이다. 이 변이가 없을 때는
    // 구현에 폼의 작성자 필드를 읽는 코드가 아예 없어서, INV-Z4 검사의 단언 둘이
    // 「그런 개념이 없다」로 자동 만족돼 있었다 (2026-09-06 test-auditor).
    file: {
      path: "src/features/edit-post/api/update-post.ts",
      find: `    .eq("author_id", user.id)`,
      replace: `    .eq("author_id", (form.get("authorId") as string) ?? user.id)`,
    },
  },
  "edit-post-redirect-from-form": {
    holds: "성공 후 목적지가 폼 값이 아니라 데이터베이스가 돌려준 id 다",
    tag: "데이터베이스가 돌려준 글",
    suite: "unit",
    // 이 변이를 등록하기 전에는 가짜가 폼과 **같은 id** 를 돌려주고 있어서, 목적지를 폼
    // 값으로 바꿔도 단언이 그대로 통과했다 (2026-09-06 security-reviewer).
    file: {
      path: "src/features/edit-post/api/edit-post.ts",
      find: '  redirect(`/posts/${result.value}`);',
      replace: '  redirect(`/posts/${String(form.get("postId"))}`);',
    },
  },
  // ── 모집글 삭제 (유닛 스위트) ──────────────────────────────────────────
  // 삭제도 갱신과 실패 모양이 같다 — 조건에 안 맞으면 오류 없이 0행이다.

  // 삭제 정책 자체의 변이 둘. 지금까지 `posts_delete_author` 에는 변이가 하나도 없었다 —
  // 코드 주석이 「인가의 주인은 정책」이라고 적어 둔 그 주인 쪽이 판정 밖에 있었다
  // (2026-09-06 test-auditor).
  "z3-posts-delete-blocked": {
    holds: "INV-Z3 — 작성자가 자기 글을 지울 수 있다 (정책이 전부 막아 버려서 통과한 것이 아니다)",
    tag: "반대 절반·삭제",
    sql: `drop policy if exists posts_delete_author on public.posts;
      create policy posts_delete_author on public.posts for delete using (false);`,
    // **undo 를 손으로 적는다.** `posts_delete_author` 는 0001 에만 있고 그 파일은
    // RESTORE_MIGRATIONS 에 없다 — 마이그레이션 재적용만으로는 안 돌아온다. 도구가
    // 지문 대조로 그 자리에서 잡았다 (2026-09-06).
    undo: `drop policy if exists posts_delete_author on public.posts;
      create policy posts_delete_author on public.posts for delete
        using (author_id = (select auth.uid()));`,
  },
  "z3-posts-delete-open": {
    holds: "INV-Z3 — 남의 모집글은 지울 수 없다",
    tag: "남이 지워도",
    sql: `drop policy if exists posts_delete_author on public.posts;
      create policy posts_delete_author on public.posts for delete using (true);`,
    // **undo 를 손으로 적는다.** `posts_delete_author` 는 0001 에만 있고 그 파일은
    // RESTORE_MIGRATIONS 에 없다 — 마이그레이션 재적용만으로는 안 돌아온다. 도구가
    // 지문 대조로 그 자리에서 잡았다 (2026-09-06).
    undo: `drop policy if exists posts_delete_author on public.posts;
      create policy posts_delete_author on public.posts for delete
        using (author_id = (select auth.uid()));`,
  },

  "delete-post-guard-dropped": {
    holds: "INV-A4 — 모집글 삭제는 세션이 없으면 아무것도 지우지 않는다",
    suite: "unit",
    file: {
      path: "src/features/delete-post/api/remove-post.ts",
      find: `  const guarded = requireSession(readUser, (user, form: FormData) =>`,
      replace: `  const guarded = requireSession((async () => ({ id: "00000000-0000-4000-8000-000000000000" })), (user, form: FormData) =>`,
    },
  },
  "delete-post-action-unguarded": {
    holds: "INV-A4 — 배포되는 모집글 삭제 액션이 가드를 거친다",
    suite: "unit",
    file: {
      path: "src/features/delete-post/api/delete-post.ts",
      find: `const guarded = makeRemovePost();`,
      replace: `const guarded = makeRemovePost((async () => ({ id: "00000000-0000-4000-8000-000000000000" })));`,
    },
  },
  "delete-post-any-author": {
    holds: "INV-Z3 — 삭제 대상을 「내가 쓴 글」로 좁히는 조건이 실제로 걸린다",
    tag: "지울 대상을",
    suite: "unit",
    file: {
      path: "src/features/delete-post/api/remove-post.ts",
      find: `    .eq("author_id", user.id)`,
      replace: `    .eq("id", postId) // 변이: 작성자 좁히기 제거`,
    },
  },
  "delete-post-author-from-form": {
    holds: "INV-Z4 — 누구의 글인지는 폼이 아니라 세션이 정한다 (삭제)",
    tag: "INV-Z4(삭제)",
    suite: "unit",
    // `delete-post-any-author` 와 find 가 같지만 갈래가 다르다 — 저것은 좁히기가 통째로
    // 사라지는 것이고 이것은 **폼 값이 인가에 쓰이는** 것이다. find 를 한 줄로 두는 이유는
    // 작업 트리가 CRLF 라 줄을 걸치면 깨끗한 소스에서도 안 맞기 때문이다.
    file: {
      path: "src/features/delete-post/api/remove-post.ts",
      find: `    .eq("author_id", user.id)`,
      replace: `    .eq("author_id", (form.get("authorId") as string) ?? user.id)`,
    },
  },
  "delete-post-zero-rows-ok": {
    holds: "INV-Z3 — 0행이 지워진 것을 성공으로 보고하지 않는다 (삭제)",
    tag: "실패경로·삭제",
    suite: "unit",
    file: {
      path: "src/features/delete-post/api/remove-post.ts",
      find: `    return { ok: false, message: "지울 수 있는 모집글이 아닙니다. 내가 쓴 글인지 확인해 주세요" };`,
      replace: `    return { ok: true, value: postId };`,
    },
  },
  "delete-post-destination-from-form": {
    holds: "삭제 후 목적지·캐시 경로가 데이터베이스가 돌려준 값이다",
    // 이름표는 **검사 이름**에 있어야 한다. 주석에만 있는 문구를 골랐다가 「엉뚱한 빨간불」로
    // 잡혔다 — 빨간불은 났는데 그 이름표를 담은 검사가 없었다 (2026-09-06).
    tag: "돌려준 스터디를 값으로 준다",
    suite: "unit",
    file: {
      path: "src/features/delete-post/api/remove-post.ts",
      find: `  return { ok: true, value: { postId: row.id, studyId: row.study_id } };`,
      replace: `  return { ok: true, value: { postId, studyId: String(form.get("studyId") ?? postId) } };`,
    },
  },
  "delete-post-revalidate-dropped": {
    holds: "모집글을 지우면 그 글이 나오던 화면 다섯을 다시 받게 한다",
    tag: "지운 뒤에 그 글이 나오던",
    suite: "unit",
    file: {
      path: "src/features/delete-post/api/remove-post.ts",
      find: `    if (result.ok) {`,
      replace: `    if (result.ok && false) {`,
    },
  },

  "delete-post-no-id-filter": {
    holds: "INV-Z3 — 어느 글을 지우는지가 실제로 걸린다",
    tag: "지울 대상을",
    suite: "unit",
    // 이 줄을 빼면 그 사람의 **모집글 전부**가 지워진다. 되돌릴 수 없는 동작이라
    // 형제 갈래(작성자 좁히기)에만 변이가 있던 것을 짝 맞춘다 (2026-09-06 test-auditor).
    file: {
      path: "src/features/delete-post/api/remove-post.ts",
      find: `    .eq("id", postId)`,
      replace: `    .eq("author_id", user.id) // 변이: 글 좁히기 제거`,
    },
  },
  "delete-post-redirect-from-form": {
    holds: "삭제 후 목적지가 폼 값이 아니라 데이터베이스가 돌려준 스터디다",
    tag: "돌려준 스터디로 보낸다",
    suite: "unit",
    file: {
      path: "src/features/delete-post/api/delete-post.ts",
      find: '  redirect(`/studies/${result.value.studyId}`);',
      replace: '  redirect(`/studies/${String(form.get("studyId"))}`);',
    },
  },
  "delete-post-confirm-skipped": {
    holds: "삭제는 한 번 눌러서 실행되지 않는다 — 두 단계 확인이 유일한 방벽이다",
    tag: "제출할 자리가 아예 없다",
    suite: "unit",
    // 승인된 시각 기준이 「실수로 지워지는 것을 막는 것은 색이 아니라 두 번 누르게 하는
    // 것」이라고 정했다. 이 삼항을 끄면 첫 화면에 제출 폼이 그대로 나온다.
    file: {
      path: "src/features/delete-post/ui/DeletePostPanel.tsx",
      find: `      {confirming ? (`,
      replace: `      {true ? (`,
    },
  },

  "edit-post-limits-unbounded": {
    holds: "모집글의 길이 상한이 실제로 걸린다 — 작성과 수정이 같은 값을 본다",
    tag: "길이 상한",
    suite: "unit",
    // 상한이 한 자리에 있으므로 이 변이는 작성·수정 양쪽 검사를 동시에 빨간불로 만들어야
    // 한다. 한쪽만 빨간불이면 다른 쪽이 숫자를 손으로 복사하고 있다는 뜻이다.
    file: {
      path: "src/entities/post/model/limits.ts",
      find: `export const TITLE_MAX = 80;`,
      replace: `export const TITLE_MAX = 800000;`,
    },
  },

  // ── 알림 (INV-N1 ~ INV-N5) ────────────────────────────────────────────
  //
  // 강제 위치가 다섯 자리로 흩어져 있다 — 조회 정책 · 삽입 정책의 **부재** · 트리거의
  // 수신자 판정 · 갱신/삭제 정책 · 열 단위 갱신 권한. 자리마다 따로 무력화한다.
  // 묶으면 하나가 붙들리는 것으로 다섯이 붙들린 것처럼 보인다.

  "n1-notifications-read-open": {
    holds: "INV-N1 — 알림은 받는 사람만 본다",
    tag: "그 스터디의 호스트여도",
    sql: `drop policy if exists notifications_read_own on public.notifications;
      create policy notifications_read_own on public.notifications for select using (true);`,
    // 이 정책은 0001 에만 있다 — 복구 목록의 마이그레이션 재적용으로는 안 돌아온다.
    undo: `drop policy if exists notifications_read_own on public.notifications;
      create policy notifications_read_own on public.notifications for select
        using (user_id = (select auth.uid()));`,
  },

  "n2-notifications-insert-open": {
    holds: "INV-N2 — 알림은 사람이 만들 수 없다",
    tag: "자기 앞으로도 알림을 못 넣는다",
    // **계약이 「정책이 없다」이므로 변이는 정책을 하나 더한다.** 없는 것을 무력화하는
    // 유일한 방법이 그것이다 — 빠뜨린 것과 일부러 안 둔 것은 겉이 같아서, 다음 사람이
    // "삽입이 안 되네" 하고 이 정책을 만들어 넣는 것이 실제로 일어날 수 있는 변경이다.
    sql: `create policy notifications_insert_any on public.notifications for insert
        to authenticated with check (true);`,
    undo: `drop policy if exists notifications_insert_any on public.notifications;`,
  },

  "n3-notify-swap-recipient": {
    holds: "INV-N3 — 알림은 사건의 상대방에게 간다",
    tag: "수락하면 알림은 신청자에게",
    // **수락 갈래 하나만** 바꿈. 셋을 묶으면 하나가 붙들리는 것으로 셋이 붙들린 것처럼
    // 보고된다 — 실제로 강퇴 갈래는 검사가 0개였는데 이 변이가 「잡혔다」로 나왔다
    // (2026-09-08 test-auditor). 정책은 하나도 안 어기는데 그 안에 남의 일이 들어 있다.
    guard: { schema: "public", fn: "notify_participation", md5: "eed8e875f764b06ab959f13f50d8b28a" },
    sql: `      create or replace function public.notify_participation() returns trigger
      language plpgsql security definer set search_path = '' as $fn$
      declare
        v_host  uuid;
        v_title text;
        v_type  text;
        v_to    uuid;
      begin
        select host_id, title into v_host, v_title
          from public.studies where id = new.study_id;
        if not found then
          return new;
        end if;

        if tg_op = 'INSERT' then
          if new.status <> 'pending' then
            return new;
          end if;
          v_type := 'participation_requested';
          v_to   := v_host;
        else
          if new.status = old.status then
            return new;
          end if;
          case new.status
            when 'accepted'  then v_type := 'participation_accepted';  v_to := v_host;
            when 'rejected'  then v_type := 'participation_rejected';  v_to := new.user_id;
            when 'kicked'    then v_type := 'participation_kicked';    v_to := new.user_id;
            when 'withdrawn' then v_type := 'participation_withdrawn'; v_to := v_host;
            else return new;
          end case;
        end if;

        if v_to = new.user_id and tg_op = 'UPDATE' and new.status = 'withdrawn' then
          return new;
        end if;

        insert into public.notifications (user_id, type, title, reference_type, reference_id)
          values (v_to, v_type, v_title, 'study', new.study_id);

        return new;
      end;
      $fn$;`,
  },

  "n3-notify-host-selfjoin": {
    holds: "INV-N3 — 스터디를 만든 호스트에게 자기 소식이 가지 않는다",
    tag: "호스트 자신이 accepted 로",
    // 스터디 생성 트리거가 호스트를 accepted 참여자로 넣는다(0001). 그 갈래를 안 건너뛰면
    // 스터디를 만들 때마다 「참가가 수락되었습니다」가 자기 앞으로 하나씩 쌓인다.
    guard: { schema: "public", fn: "notify_participation", md5: "eed8e875f764b06ab959f13f50d8b28a" },
    sql: `      create or replace function public.notify_participation() returns trigger
      language plpgsql security definer set search_path = '' as $fn$
      declare
        v_host  uuid;
        v_title text;
        v_type  text;
        v_to    uuid;
      begin
        select host_id, title into v_host, v_title
          from public.studies where id = new.study_id;
        if not found then
          return new;
        end if;

        if tg_op = 'INSERT' then
          if new.status = 'pending' then
            v_type := 'participation_requested';
            v_to   := v_host;
          else
            v_type := 'participation_accepted';
            v_to   := new.user_id;
          end if;
        else
          if new.status = old.status then
            return new;
          end if;
          case new.status
            when 'accepted'  then v_type := 'participation_accepted';  v_to := new.user_id;
            when 'rejected'  then v_type := 'participation_rejected';  v_to := new.user_id;
            when 'kicked'    then v_type := 'participation_kicked';    v_to := new.user_id;
            when 'withdrawn' then v_type := 'participation_withdrawn'; v_to := v_host;
            else return new;
          end case;
        end if;

        if v_to = new.user_id and tg_op = 'UPDATE' and new.status = 'withdrawn' then
          return new;
        end if;

        insert into public.notifications (user_id, type, title, reference_type, reference_id)
          values (v_to, v_type, v_title, 'study', new.study_id);

        return new;
      end;
      $fn$;`,
  },

  "n4-notifications-update-open": {
    holds: "INV-N4 — 남의 알림을 읽음으로 바꿀 수 없다",
    tag: "남의 알림은 읽음으로",
    sql: `drop policy if exists notifications_update_own on public.notifications;
      create policy notifications_update_own on public.notifications for update
        using (true) with check (true);`,
    undo: `drop policy if exists notifications_update_own on public.notifications;
      create policy notifications_update_own on public.notifications for update
        using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));`,
  },

  "n4-notifications-delete-open": {
    holds: "INV-N4 — 남의 알림을 지울 수 없다",
    tag: "남의 알림은 못 지운다",
    sql: `drop policy if exists notifications_delete_own on public.notifications;
      create policy notifications_delete_own on public.notifications for delete using (true);`,
    undo: `drop policy if exists notifications_delete_own on public.notifications;
      create policy notifications_delete_own on public.notifications for delete
        using (user_id = (select auth.uid()));`,
  },

  "n3-notify-kick-to-host": {
    holds: "INV-N3 — 강퇴 알림은 강퇴당한 사람에게 간다",
    tag: "강퇴도 그 사람에게",
    // 강퇴 갈래만 뒤집는다. 그러면 강퇴당한 사람은 아무 소식도 못 받고, 호스트 앞으로
    // 「내보내졌습니다」가 쌓인다 — 자기 알림 안에 남의 일이 들어 있는 상태다.
    guard: { schema: "public", fn: "notify_participation", md5: "eed8e875f764b06ab959f13f50d8b28a" },
    sql: `      create or replace function public.notify_participation() returns trigger
      language plpgsql security definer set search_path = '' as $fn$
      declare
        v_host  uuid;
        v_title text;
        v_type  text;
        v_to    uuid;
      begin
        select host_id, title into v_host, v_title
          from public.studies where id = new.study_id;
        if not found then
          return new;
        end if;

        if tg_op = 'INSERT' then
          if new.status <> 'pending' then
            return new;
          end if;
          v_type := 'participation_requested';
          v_to   := v_host;
        else
          if new.status = old.status then
            return new;
          end if;
          case new.status
            when 'accepted'  then v_type := 'participation_accepted';  v_to := new.user_id;
            when 'rejected'  then v_type := 'participation_rejected';  v_to := new.user_id;
            when 'kicked'    then v_type := 'participation_kicked';    v_to := v_host;
            when 'withdrawn' then v_type := 'participation_withdrawn'; v_to := v_host;
            else return new;
          end case;
        end if;

        if v_to = new.user_id and tg_op = 'UPDATE' and new.status = 'withdrawn' then
          return new;
        end if;

        insert into public.notifications (user_id, type, title, reference_type, reference_id)
          values (v_to, v_type, v_title, 'study', new.study_id);

        return new;
      end;
      $fn$;`,
  },

  "n3-notify-withdraw-to-self": {
    holds: "INV-N3 — 탈퇴 알림은 호스트에게 간다",
    tag: "멤버가 스스로 나가면 알림은 호스트에게",
    guard: { schema: "public", fn: "notify_participation", md5: "eed8e875f764b06ab959f13f50d8b28a" },
    sql: `      create or replace function public.notify_participation() returns trigger
      language plpgsql security definer set search_path = '' as $fn$
      declare
        v_host  uuid;
        v_title text;
        v_type  text;
        v_to    uuid;
      begin
        select host_id, title into v_host, v_title
          from public.studies where id = new.study_id;
        if not found then
          return new;
        end if;

        if tg_op = 'INSERT' then
          if new.status <> 'pending' then
            return new;
          end if;
          v_type := 'participation_requested';
          v_to   := v_host;
        else
          if new.status = old.status then
            return new;
          end if;
          case new.status
            when 'accepted'  then v_type := 'participation_accepted';  v_to := new.user_id;
            when 'rejected'  then v_type := 'participation_rejected';  v_to := new.user_id;
            when 'kicked'    then v_type := 'participation_kicked';    v_to := new.user_id;
            when 'withdrawn' then v_type := 'participation_withdrawn'; v_to := new.user_id;
            else return new;
          end case;
        end if;

        if v_to = new.user_id and tg_op = 'UPDATE' and new.status = 'withdrawn' then
          return new;
        end if;

        insert into public.notifications (user_id, type, title, reference_type, reference_id)
          values (v_to, v_type, v_title, 'study', new.study_id);

        return new;
      end;
      $fn$;`,
  },

  "n3-notify-no-selfwithdraw-skip": {
    holds: "INV-N3 — 호스트가 스스로 나가면 자기에게 알림이 안 간다",
    tag: "스스로 나가면 알림이 안 생긴다",
    // 건너뛰는 블록을 통째로 뺀다.
    guard: { schema: "public", fn: "notify_participation", md5: "eed8e875f764b06ab959f13f50d8b28a" },
    sql: `      create or replace function public.notify_participation() returns trigger
      language plpgsql security definer set search_path = '' as $fn$
      declare
        v_host  uuid;
        v_title text;
        v_type  text;
        v_to    uuid;
      begin
        select host_id, title into v_host, v_title
          from public.studies where id = new.study_id;
        if not found then
          return new;
        end if;

        if tg_op = 'INSERT' then
          if new.status <> 'pending' then
            return new;
          end if;
          v_type := 'participation_requested';
          v_to   := v_host;
        else
          if new.status = old.status then
            return new;
          end if;
          case new.status
            when 'accepted'  then v_type := 'participation_accepted';  v_to := new.user_id;
            when 'rejected'  then v_type := 'participation_rejected';  v_to := new.user_id;
            when 'kicked'    then v_type := 'participation_kicked';    v_to := new.user_id;
            when 'withdrawn' then v_type := 'participation_withdrawn'; v_to := v_host;
            else return new;
          end case;
        end if;

        insert into public.notifications (user_id, type, title, reference_type, reference_id)
          values (v_to, v_type, v_title, 'study', new.study_id);

        return new;
      end;
      $fn$;`,
  },

  "n2-notify-invoker": {
    holds: "INV-N2 — 알림을 만드는 것은 security definer 트리거뿐이다",
    tag: "참가 신청은 알림 행을 실제로 만든다",
    // **`security definer` 만 뺀다.** 그러면 트리거가 호출자 권한으로 돌고, 알림 표에는
    // 삽입 정책이 없으므로 42501 이 난다 — 트리거가 실패하면서 **참여자 삽입 자체가
    // 롤백된다.** 그 상태의 제품은 참가 신청·수락·거절·강퇴·탈퇴가 전부 죽는다.
    // 관리 연결로만 넣는 검사는 RLS 를 우회해서 이 갈래를 절대 못 본다.
    guard: { schema: "public", fn: "notify_participation", md5: "eed8e875f764b06ab959f13f50d8b28a" },
    sql: `      create or replace function public.notify_participation() returns trigger
      language plpgsql set search_path = '' as $fn$
      declare
        v_host  uuid;
        v_title text;
        v_type  text;
        v_to    uuid;
      begin
        select host_id, title into v_host, v_title
          from public.studies where id = new.study_id;
        if not found then
          return new;
        end if;

        if tg_op = 'INSERT' then
          if new.status <> 'pending' then
            return new;
          end if;
          v_type := 'participation_requested';
          v_to   := v_host;
        else
          if new.status = old.status then
            return new;
          end if;
          case new.status
            when 'accepted'  then v_type := 'participation_accepted';  v_to := new.user_id;
            when 'rejected'  then v_type := 'participation_rejected';  v_to := new.user_id;
            when 'kicked'    then v_type := 'participation_kicked';    v_to := new.user_id;
            when 'withdrawn' then v_type := 'participation_withdrawn'; v_to := v_host;
            else return new;
          end case;
        end if;

        if v_to = new.user_id and tg_op = 'UPDATE' and new.status = 'withdrawn' then
          return new;
        end if;

        insert into public.notifications (user_id, type, title, reference_type, reference_id)
          values (v_to, v_type, v_title, 'study', new.study_id);

        return new;
      end;
      $fn$;`,
  },

  "n8-count-ignores-read": {
    holds: "INV-N8 — 종 옆 숫자는 안 읽은 것만 센다",
    tag: "세는 조건은 「읽은 시각이 비어 있다」다",
    suite: "unit",
    // 세는 쪽의 조건을 뺀다. 숫자가 읽은 것까지 세어, 패널을 열기 전 화면이
    // 「숫자 3, 열면 안 읽음 0」이 된다 — INV-N8 의 위반 문장 그대로다.
    file: {
      path: "src/entities/notification/api/read-unread-count.ts",
      find: "      .is(\"read_at\", null);",
      replace: "      ;",
    },
  },

  "n8-reader-oldest-first": {
    holds: "INV-N8 — 목록은 최근 것부터 담는다",
    tag: "안 읽은 것부터 담는다",
    suite: "unit",
    // 시간 정렬을 뒤집는다. 알림이 100개가 넘는 사람에게 **가장 오래된 100줄**이
    // 나가고 새 알림이 패널에서 사라진다.
    file: {
      path: "src/entities/notification/api/read-my-notifications.ts",
      find: "    .order(\"created_at\", { ascending: false })",
      replace: "    .order(\"created_at\", { ascending: true })",
    },
  },

  "n5-markall-sends-more-columns": {
    holds: "INV-N5 — 전체 읽음이 보내는 값도 read_at 하나뿐이다",
    tag: "안 읽은 것만 대상이고",
    suite: "unit",
    // 열을 하나 얹는다. 0019 의 열 권한이 요청을 통째로 거부해서 「전체 읽음」이
    // 영영 실패하는데, 화면에는 「잠시 뒤 다시」로만 보인다.
    file: {
      path: "src/features/manage-notifications/api/notification-ops.ts",
      find: "    .update({ read_at: new Date().toISOString() })\n    .is(\"read_at\", null);",
      replace: "    .update({ read_at: new Date().toISOString(), type: \"x\" })\n    .is(\"read_at\", null);",
    },
  },

  "n6-sentence-tail-wrong": {
    holds: "INV-N6 — 거절 알림은 거절되었다고 적는다",
    tag: "종류마다 무엇이라고 적는지",
    suite: "unit",
    // 거절의 꼬리말을 수락으로 바꿔 둔다. 「서로 다르다」만 보는 검사로는 안 걸린다.
    file: {
      path: "src/entities/notification/model/notification.ts",
      find: "  participation_rejected: \" 참가가 거절되었습니다\",",
      replace: "  participation_rejected: \" 참가가 수락되었습니다.\",",
    },
  },

  "n4-bell-form-key-drift": {
    holds: "INV-N4 — 패널이 보내는 폼 칸 이름과 액션이 읽는 이름이 같다",
    tag: "액션이 실제로 읽는 칸 이름으로",
    suite: "unit",
    // 칸 이름을 바꾼다. 패널 검사는 진짜 상수를 쓰고 액션 검사는 문자열을 쓰므로
    // 한쪽이 빨간불이 된다 — 그게 이 상수를 뽑아낸 이유다.
    file: {
      path: "src/features/manage-notifications/model/fields.ts",
      find: "export const NOTIFICATION_ID_FIELD = \"notificationId\";",
      replace: "export const NOTIFICATION_ID_FIELD = \"id\";",
    },
  },

  // ── 알림 화면·액션 (INV-N5 · INV-N7 · INV-N8) ─────────────────────────
  //
  // 위 일곱은 데이터베이스 쪽 강제 장치다. 아래 다섯은 앱 쪽 자리 — 판독기가 링크를
  // 정하는 곳, 패널이 그 값을 지키는 곳, 액션이 헤더를 다시 그리게 하는 곳.

  "n7-reader-links-everything": {
    holds: "INV-N7 — 지금 안 보이는 스터디에는 링크를 안 건다",
    tag: "보이는 스터디를 가리킬 때만",
    suite: "unit",
    // 지워진 스터디를 가리키는 알림에도 주소가 붙는다. 누르지 않아도 미리 가져오기가
    // 404 를 만드는 상태다.
    file: {
      path: "src/entities/notification/api/read-my-notifications.ts",
      find: "    const 보인다 = 스터디를가리킨다 && lookup.ok && lookup.visible.has(row.reference_id as string);",
      replace: "    const 보인다 = 스터디를가리킨다;",
    },
  },

  "n7-panel-links-dead-row": {
    holds: "INV-N7 — 주소가 없는 줄은 링크로 그리지 않는다",
    tag: "주소가 없는 줄은 링크가 아니다",
    suite: "unit",
    // 판독기가 「주소 없음」을 돌려줘도 화면이 링크로 그린다. 강제 위치가 둘이라
    // 판독기 변이와 따로 둔다 — 묶으면 한쪽만 붙들려도 둘 다 잡힌 것처럼 보인다.
    file: {
      path: "src/widgets/site-header/ui/NotificationBell.tsx",
      find: "          <div className={styles.dead}>{문장}</div>",
      replace: "          <Link className={styles.link} href=\"/\">{문장}</Link>",
    },
  },

  "n8-badge-ignores-list": {
    holds: "INV-N8 — 종 옆 숫자는 패널이 그리는 안 읽음 줄에서 나온다",
    tag: "숫자가 패널이 그리는 안 읽음 줄 수와 같아진다",
    suite: "unit",
    // 숫자가 목록과 무관하게 서버 값에 고정된다. 읽음 처리를 해도 안 줄어든다 —
    // 「패널은 비었는데 숫자는 3」이 정확히 이 상태다.
    file: {
      path: "src/widgets/site-header/ui/NotificationBell.tsx",
      find: "  const unread = items === null ? unreadCount : countUnread(items);",
      replace: "  const unread = unreadCount;",
    },
  },

  "n8-action-skips-revalidate": {
    holds: "INV-N8 — 알림을 바꾸면 헤더를 다시 그리게 한다",
    tag: "헤더를 다시 그리게 한다",
    suite: "unit",
    // 액션은 성공하는데 헤더가 옛 숫자를 들고 남는다. 다른 화면으로 넘어가야 맞춰진다.
    file: {
      path: "src/features/manage-notifications/api/notification-ops.ts",
      find: "      if (result.ok) deps.revalidateHeader();",
      replace: "      if (!result.ok) deps.revalidateHeader();",
    },
  },

  "n5-mark-read-sends-more-columns": {
    holds: "INV-N5 — 읽음 처리가 보내는 값은 read_at 하나뿐이다",
    tag: "보내는 값은 read_at 하나뿐이다",
    suite: "unit",
    // 읽음 처리에 다른 열을 얹는다. 0019 의 열 권한이 요청을 통째로 거부하므로 제품은
    // 「읽음 처리가 안 되는」 상태가 되는데, 그 실패는 화면에서 「잠시 뒤 다시」로만 보인다.
    file: {
      path: "src/features/manage-notifications/api/notification-ops.ts",
      find: "    .update({ read_at: new Date().toISOString() })\n    .eq(\"id\", id)",
      replace: "    .update({ read_at: new Date().toISOString(), type: \"x\" })\n    .eq(\"id\", id)",
    },
  },

  "n5-notifications-columns": {
    holds: "INV-N5 — 만들어진 알림의 내용은 바뀌지 않는다",
    tag: "종류를 못 바꾼다",
    // 0019 가 좁힌 것을 도로 연다. 접근 정책은 그대로인데(받는 사람만 본다) 그 판정을
    // 통과한 갱신이 type·title 을 요청이 보낸 값으로 바꾼다.
    sql: `grant update on public.notifications to authenticated;`,
  },
};

/**
 * 변이가 가리키는 불변식 ID — `holds` 에 적힌 첫 `INV-XX` 를 그대로 쓴다.
 *
 * 따로 한 번 더 적지 않는 이유는 둘이 갈라지기 때문이다. 이 ID 는 장식이 아니라 판정의
 * 절반이다 — mutation-run.mjs 는 "빨간불이 났는가"만 보지 않고 "**그 INV 를 이름에 담은\n* 테스트가** 빨간불이 났는가"를 본다. 그래서 ID 가 없는 변이는 판정할 근거가 없고,
 * 목록을 내주기 전에 여기서 멈춘다.
 */
const INV_ID = /INV-[A-Z]\d+/;

/**
 * 판정에 쓸 이름표. 기본은 holds 에 적힌 첫 INV ID 이고, tag 를 적으면 그것이 이긴다.
 *
 * tag 가 필요한 이유: 붙들어야 할 규칙이 전부 스펙 불변식인 것은 아니다. 「마감 임박순」은
 * 화면 목록 문서가 정한 규칙이라 INV ID 가 없는데, ID 를 요구하면 **판정 대상이 될 수 없어서
 * 검사 밖에 남는다** — 그러면 이 도구는 스펙이 있는 것만 지키고 나머지는 조용히 놓친다.
 */
const invOf = (m) => m.tag ?? INV_ID.exec(m.holds)?.[0];

const nameless = Object.entries(MUTATIONS)
  .filter(([, m]) => !invOf(m))
  .map(([name]) => name);
if (nameless.length > 0) {
  console.error(
    `이름표가 없는 변이: ${nameless.join(", ")}\n` +
      "  판정이 '실패한 테스트 이름이 그 이름표를 담는가' 이므로, 이름표가 없으면 판정할 수 없다.\n" +
      "  holds 에 INV ID 를 적거나 tag 를 붙인다.",
  );
  process.exit(1);
}

/**
 * 강제 장치의 지문 — 정책 · 함수 본문 · 권한 · 트리거 · 제약 · 행 수준 접근 켜짐 여부를
 * 한 덩어리 문자열로 뽑는다.
 *
 * 왜 필요한가: `--restore` 는 마이그레이션을 다시 적용할 뿐이고, **다시 적용했다는 것과
 * 원래대로 돌아왔다는 것은 다르다.** 변이가 건드린 것을 어느 마이그레이션도 다시 정의하지
 * 않으면 복구는 아무 오류 없이 실패하고, 그 뒤에 도는 변이들은 전부 망가진 데이터베이스
 * 위에서 판정된다. 지문을 변이 전후로 비교하면 그 조용한 실패가 소리를 낸다.
 */
const FINGERPRINT_SQL = `
select
  coalesce((select string_agg(format('policy %s.%s %s [%s] using(%s) check(%s)',
             schemaname, tablename, policyname, cmd, coalesce(qual, '-'), coalesce(with_check, '-')),
           E'\n' order by schemaname, tablename, policyname)
      from pg_policies where schemaname in ('public', 'storage', 'realtime')), '')
  || E'\n' ||
  coalesce((select string_agg(format('func %s.%s(%s) definer=%s acl=%s src=%s',
             n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
             p.prosecdef, coalesce(p.proacl::text, '-'), md5(p.prosrc)),
           E'\n' order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')), '')
  || E'\n' ||
  coalesce((select string_agg(format('grant %s.%s %s %s %s',
             table_schema, table_name, grantee, privilege_type, col),
           E'\n' order by table_schema, table_name, grantee, privilege_type, col)
      from (
        select table_schema::text, table_name::text, grantee::text, privilege_type::text, '*'::text as col
          from information_schema.role_table_grants
         where table_schema in ('public', 'storage') and grantee in ('anon', 'authenticated')
        union all
        select table_schema::text, table_name::text, grantee::text, privilege_type::text, column_name::text
          from information_schema.column_privileges
         where table_schema in ('public', 'storage') and grantee in ('anon', 'authenticated')
      ) g), '')
  || E'\n' ||
  coalesce((select string_agg(format('trigger %s.%s %s', c.relname, t.tgname, md5(pg_get_triggerdef(t.oid))),
           E'\n' order by c.relname, t.tgname)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('public', 'auth') and not t.tgisinternal), '')
  || E'\n' ||
  coalesce((select string_agg(format('constraint %s.%s %s', c.relname, con.conname, pg_get_constraintdef(con.oid)),
           E'\n' order by c.relname, con.conname)
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'), '')
  || E'\n' ||
  coalesce((select string_agg(format('rls %s %s', c.relname, c.relrowsecurity), E'\n' order by c.relname)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'), '')
  || E'\n' ||
  -- **버킷 설정도 강제 장치다.** 아바타의 허용 형식·크기 상한은 정책이 아니라 버킷 행에
  -- 있어서(INV-E4), 여기 안 넣으면 그것을 지운 변이가 「강제 장치를 하나도 안 바꿨다」로
  -- 판정된다 — 실제로는 방벽 하나가 통째로 사라진 상태인데 판정 불가로 조용히 넘어간다
  -- (2026-09-06 실측).
  coalesce((select string_agg(format('bucket %s public=%s size=%s mime=%s',
             id, public, coalesce(file_size_limit::text, '-'),
             coalesce(array_to_string(allowed_mime_types, ','), '-')),
           E'\n' order by id)
      from storage.buckets), '')
  || E'\n' ||
  -- 강제 장치는 아니지만 **다음 판정을 바꾸는 것**이라 같이 본다. 뒷정리가 실패해 사용자가
  -- 남으면 다음 변이가 그 위에서 돌고, 그 오염은 정책 지문에는 안 잡힌다.
  (select format('users %s', count(*)) from auth.users)
  as fingerprint
`;

/**
 * 소스 파일을 바꾸는 변이의 **파일 지문**. 데이터베이스 지문과 같은 자리에 붙는다.
 *
 * 없으면 파일 변이에는 ④(복구 확인)가 통째로 비어 있게 된다 — 데이터베이스는 안 건드리므로
 * SQL 지문이 되돌아왔든 아니든 항상 같고, 그래서 판정 쪽이 「복구됐다」로 읽는다.
 */
function fileFingerprint() {
  const lines = [];
  for (const [name, m] of Object.entries(MUTATIONS)) {
    if (!m.file) continue;
    const target = join(HERE, "..", m.file.path);
    const cur = readFileSync(target, "utf-8");
    lines.push(
      `file ${name} ${m.file.path} ${createHash("sha256").update(cur).digest("hex").slice(0, 16)}`,
    );
  }
  return lines.sort().join("\n");
}

async function query(sql, params) {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    return await c.query(sql, params);
  } finally {
    await c.end();
  }
}

/**
 * **본문을 통째로 다시 적는 변이가 낡는 것을 막는다.**
 *
 * 판정 함수의 본문 전체를 심는 변이는, 원본이 나중에 조건을 하나 더 얻으면 「낡은 본문 +
 * 의도한 한 줄」을 심는다. 그때 빨간불이 변이 때문인지 되돌아간 본문 때문인지 안 갈린다 —
 * 변이는 하나를 무력화한다고 적혀 있는데 실제로는 둘을 무력화한 상태가 된다.
 *
 * 그래서 심기 전에 원본 본문의 해시를 대조하고, 다르면 **심지 않고 멈춘다.**
 * 고칠 곳은 원본이 아니라 변이의 sql 과 이 해시다.
 */
async function assertBodyFresh(name, guard) {
  const r = await query(
    "select md5(p.prosrc) as md5 from pg_proc p join pg_namespace n on n.oid = p.pronamespace" +
      " where n.nspname = $1 and p.proname = $2",
    [guard.schema, guard.fn],
  );
  if (r.rowCount !== 1) {
    console.error(
      `변이 ${name} 의 대조 대상 ${guard.schema}.${guard.fn} 을 못 찾았다(${r.rowCount}건).` +
        "\n  이름이 바뀌었거나 데이터베이스가 복구 전 상태다.",
    );
    process.exit(1);
  }
  if (r.rows[0].md5 !== guard.md5) {
    console.error(
      `변이 ${name} 이 낡았다 — ${guard.schema}.${guard.fn} 의 본문이 바뀌었다.` +
        `\n  등록된 해시: ${guard.md5}\n  지금 해시:   ${r.rows[0].md5}` +
        "\n  이 변이는 본문을 통째로 다시 적는다. 지금 심으면 의도한 한 줄 말고" +
        " **바뀐 부분까지 되돌린 상태**가 되고, 빨간불의 원인이 갈리지 않는다." +
        "\n  고칠 곳은 원본이 아니라 이 변이의 sql 과 guard.md5 다.",
    );
    process.exit(1);
  }
}

/**
 * 기본 복구 — 정책·권한·함수를 다시 정의하는 마이그레이션을 순서대로 다시 적용한다.
 *
 * 전부 다 돌리지 않는 이유: **0001 은 재적용 안전하지 않다.** 0002 가 `studies.region` 을
 * `region_code` 로 바꿨기 때문에 0001 의 `create index ... (region)` 이 없는 컬럼을 가리켜
 * 죽는다. 그래서 여기 목록은 손으로 고른 것이고, 손으로 고른 목록은 낡는다 —
 * 그것을 믿지 않기 위해 mutation-run.mjs 가 변이 전후의 지문을 대조한다.
 */
const RESTORE_MIGRATIONS = [
  "0002_review_fixes.sql",
  "0004_member_visibility.sql",
  "0007_deadline_sort.sql",
  "0008_deadline_rank.sql",
  // 0009 는 0008 의 순위 함수를 **덮어쓴다**(무한 날짜 가지가 붙는다). 순서대로 적용되므로
  // 이 줄이 0008 뒤에 있어야 복구가 최신 본체로 끝난다.
  "0009_recruit_until_finite.sql",
  // **0010 은 반드시 맨 뒤다.** 위의 0002·0004 는 판정 함수를 `public` 에 다시 만들고
  // 정책을 그쪽으로 다시 걸어 놓는다 — 0010 이 뒤따라 돌아야 그 함수들이 다시 지워지고
  // 정책이 `private` 을 가리킨다. 순서를 바꾸면 복구가 끝난 자리에 S4 의 구멍이 도로 열린다.
  "0010_signup_profile_and_private_helpers.sql",
  // 0011 은 0010 뒤여야 한다 — 판정 함수가 private.study_is_visible 등을 부르므로
  // 그 함수들이 이미 있어야 만들어진다. 그리고 profiles_read 를 다시 거는 것도 여기다.
  "0011_profile_visibility.sql",
  // 0012 는 0010 뒤여야 한다 — 0010 이 chat_broadcast_read 를 느슨한 조건으로 다시 걸고,
  // 0012 가 뒤따라 돌아야 그 조건이 uuid 모양으로 좁혀진다.
  "0012_topic_shape.sql",
  // 0013 은 0012 뒤여야 한다 — 0012 가 정규식을 정책 안에 직접 쓰고, 0013 이 그것을
  // private.chat_topic_uuid 로 옮겨 담는다. 순서를 바꾸면 복구가 끝난 자리에 「모양 검사와
  // 형변환이 and 로 묶인」 옛 조건이 남는다. 인덱스 셋도 여기서 다시 만들어진다.
  "0013_profile_lookup_index_and_topic_order.sql",
  // 0014 는 0010 뒤여야 한다 — 0010 이 posts_insert_author 를 「작성자 + 호스트」 두 조건으로
  // 다시 걸고, 0014 가 뒤따라 돌아야 거기에 「모집 중인 스터디」가 더해진다(INV-Z14).
  // 빠뜨리면 복구가 끝난 자리에 2026-09-06 에 닫은 구멍이 도로 열린 채로 남는다.
  "0014_post_insert_requires_recruiting_study.sql",
  // 0015 는 0001 이 만든 아바타 정책 넷을 다시 쓰고(경로 판정 · 목록 제한), 버킷 제한과
  // 지역 외래 키를 건다. 목록에 없으면 이 파일이 건드리는 것을 무력화한 변이가 복구되지
  // 않아 지문이 어긋나고, 그 뒤의 변이가 전부 오염된 데이터베이스에서 판정된다.
  // 전부 `drop … if exists` + 조건 있는 update 라 다시 돌려도 결과가 같다.
  "0015_profile_editing.sql",
  // 0017 은 0010 뒤여야 한다 — 0010 이 sessions_write_host·sessions_del_host 를 「호스트인가」
  // 하나로 다시 걸고, 0017 이 뒤따라 돌아야 그것이 「호스트이고 안 지워졌는가」로 좁혀진다.
  // 빠뜨리면 복구가 끝난 자리에 INV-Z16 의 구멍이 도로 열린 채로 남고, 그 뒤의 변이가
  // 전부 그 상태에서 판정된다.
  "0017_study_edit_guard.sql",
  // 0018 은 0001 이 만든 sessions_read 를 다시 쓴다(`using (true)` → 「볼 수 있는 사람만」).
  // 목록에 없으면 그 정책을 무력화한 변이가 안 돌아오고, 그 뒤의 변이가 전부 요일·시간이
  // 통째로 열린 데이터베이스에서 판정된다.
  "0018_sessions_read_scope.sql",
  // 0019 는 0001·0002 가 열어 둔 알림 표의 갱신 권한을 read_at 한 열로 좁힌다. 목록에
  // 없으면 `n5-notifications-columns` 가 심은 「표 전체 갱신」이 안 돌아오고, 그 뒤의
  // 변이가 전부 알림을 마음대로 고칠 수 있는 데이터베이스에서 판정된다.
  "0019_notification_update_scope.sql",
  // 0020 은 스터디 제목의 제약 셋과 알림 사본의 제약 하나를 건다. 목록에 있어야 그 넷을
  // 무력화한 변이가 **파일 하나에서** 되돌아온다 — undo 에 손으로 옮겨 적으면 0020 을
  // 고치는 날 복구가 옛 값으로 되돌려 놓고, 그 사실이 「복구 실패」로만 보인다.
  // 전부 `drop … if exists` + `add constraint` 라 다시 돌려도 결과가 같다.
  "0020_study_title_length.sql",
  // 0021 은 메시지 표의 열 단위 삽입 권한 · 본문 제약 둘 · 읽음 시각 트리거를 건다.
  // 목록에 있어야 그 넷을 무력화한 변이가 **파일 하나에서** 되돌아온다. 전부
  // `revoke`+`grant` · `drop … if exists`+`add constraint` · `create or replace` ·
  // `drop trigger`+`create trigger` 라 다시 돌려도 결과가 같다.
  //
  // **0021 이 새로 만들지 않는 것은 여기서 안 돌아온다** — INV-M5 를 지키는 것은
  // 「갱신·삭제 정책이 없음」이고, 없는 것은 재적용으로 다시 없어지지 않는다.
  // 그 자리를 여는 변이 둘은 undo 를 따로 들고 있다.
  "0021_chat_message_integrity.sql",
  // 0022 는 순서에 걸리는 것이 없다 — 네 표에 제약만 더한다. 여기 없으면 이 제약들을
  // 떼는 변이가 복구되지 않고, 그 뒤의 변이는 전부 오염된 데이터베이스에서 판정된다
  // (2026-09-11 에 실제로 멈췄다 — 지문 대조가 잡았다).
  "0022_text_display_integrity.sql",
];

/**
 * 복구. `undo` 를 가진 변이는 그것까지 실행한다 — 0001 에만 있는 정책처럼 위 목록으로는
 * 되돌아오지 않는 것들이다. `undo` 가 틀려도 조용히 넘어가지 않는다(지문 대조가 잡는다).
 */
/**
 * 복구를 시작하기 전에 심는 껍데기 함수 **하나**.
 *
 * **왜 필요한가**: 복구는 옛 마이그레이션을 다시 트는데, 0002·0004 의 정책 정의가
 * `public.is_study_host` 를 이름으로 가리킨다. 그 함수를 만드는 것은 0001 뿐이고 0001 은
 * 재적용이 안전하지 않다(컬럼 이름이 바뀌었다). 0010 이 그 함수를 지웠으므로 복구 두 번째
 * 줄에서 "함수가 없다"로 죽는다 — 실제로 죽었다.
 *
 * **하나뿐인 이유**: 나머지 여섯은 복구 목록 안에서 진짜 본문으로 다시 만들어진다
 * (`study_accepted_count`·`study_is_recruiting`·`study_is_visible`·`study_accepts_applications`
 * 는 0002 가, `is_study_member` 는 0004 가). `is_chat_member` 는 복구 목록의 어느 파일도
 * 부르지 않는다. 그래서 껍데기가 필요한 것은 `is_study_host` 하나다.
 *
 * **본문이 아니라 존재만 필요하다.** 정책 DDL 은 이름과 인자만 맞으면 만들어지고, 이
 * 함수는 목록 맨 뒤의 0010 이 다시 지운다. 진짜 판정을 베껴 적지 않는 이유는 정본이
 * 세 곳이 되면 언젠가 한 곳만 고쳐지기 때문이다.
 *
 * **중간에 죽으면 어떻게 되나**: 아래 `restore` 가 전부를 트랜잭션 하나로 묶으므로
 * 아무것도 안 남는다. 묶기 전에는 0002 가 지나간 뒤에 죽으면 판정 함수 다섯이 **진짜
 * 본문 그대로** public 에 남았다 — 껍데기가 연 것이 아니라 0002 가 연 것이라, 껍데기를
 * 아무리 안전하게 만들어도 그 상태는 못 막았다.
 *
 * (`create or replace` 는 반환 타입을 못 바꾸므로 타입은 원본과 같아야 한다.)
 */
const RESTORE_PRELUDE = `
create or replace function public.is_study_host(p_study_id uuid, p_user_id uuid) returns boolean
language sql immutable as $stub$ select false $stub$;
`;

/**
 * 복구가 끝난 자리를 **복구 자신이 확인한다.**
 *
 * 지문 대조로는 이것을 못 잡는다 — mutation-run 은 기준선 지문을 뜨기 전에 복구를 먼저
 * 돌리므로, 순서가 틀린 복구는 매번 같은(틀린) 상태를 만들고 그 상태가 기준선이 된다.
 * 그러면 이후 모든 복구가 「일치」로 나온다. 손으로 `--restore` 만 돌린 사람에게는
 * 대조할 원본조차 없다.
 *
 * 이 한 줄이 셋을 동시에 잡는다 — 0010 이 목록 맨 뒤가 아닌 경우 · 껍데기가 남은 경우 ·
 * 목록이 낡아 0010 이 빠진 경우.
 */
const RESTORE_ASSERT = `
select p.proname as what from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = any(array['is_study_host','is_chat_member','is_study_member',
                             'study_is_visible','study_accepts_applications',
                             'study_accepted_count','study_is_recruiting'])
union all
-- 같은 함정이 프로필 조회 정책에도 있다. 0011 이 목록에서 빠지거나 0010 앞으로 가면
-- **복구가 끝난 자리에 회원 명부가 도로 열린 채로 남는다**(INV-Z13). 이름이 아니라
-- 판정 함수를 부르는지로 본다 — 'true' 만 보면 다른 모양으로 넓힌 것을 놓친다.
select '프로필 조회 정책이 판정 함수를 안 부른다 (INV-Z13)' as what
 where not exists (
   select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_read'
      and strpos(qual, 'profile_is_visible') > 0
 )
union all
-- 0021 이 목록에서 빠지면 복구가 끝난 자리에 **메시지 삽입이 통째로 열린 채로** 남고
-- (INV-M1) 그 뒤의 모든 변이가 그 데이터베이스에서 판정된다. 열 이름으로 보지 않고
-- 「표 단위 INSERT 가 남아 있나」로 본다 — 열 목록이 넓어지는 모양을 다 덮는다.
select '메시지 삽입 권한이 열 단위로 안 좁혀져 있다 (INV-M1, 0021)' as what
 where exists (
   select 1 from information_schema.table_privileges
    where table_schema = 'public' and table_name = 'chat_messages'
      and grantee in ('anon', 'authenticated') and privilege_type = 'INSERT'
 )
union all
-- 갱신·삭제 권한도 같이 본다(INV-M5). 정책이 없어 오늘 손해는 없지만, 복구가 이것을
-- 안 되돌리면 「수정 정책 한 줄이 열 전부를 연다」는 상태로 그 뒤 변이가 판정된다.
select '메시지 표에 갱신·삭제 권한이 남아 있다 (INV-M5, 0021)' as what
 where exists (
   select 1 from information_schema.table_privileges
    where table_schema = 'public' and table_name = 'chat_messages'
      and grantee in ('anon', 'authenticated') and privilege_type in ('UPDATE', 'DELETE')
 )
union all
-- **실시간 방송의 쓰기 정책**(INV-M1). "realtime.messages" 에 읽기 정책만 있다는 **사실**이
-- 「클라이언트가 남의 방 화면에 아무 행이나 밀어 넣지 못한다」를 지키는 전부다 — 방 화면은
-- 방송으로 온 행을 검증 없이 그리므로 0021·0022 의 제약이 그 경로에는 하나도 안 걸린다.
--
-- 이 정책을 만드는 마이그레이션이 없어서, 유일한 제거 수단이 변이에 손으로 적은 "undo"
-- 한 줄이다. **그 줄에 오타가 나거나 누가 지우면 「복구 완료」가 그대로 찍힌다**
-- (2026-09-11 security-reviewer). 여기서 보면 그 조용한 실패가 소리를 낸다.
select '실시간 방송에 쓰기 정책이 남아 있다 (INV-M1)' as what
 where exists (
   select 1 from pg_policies
    where schemaname = 'realtime' and tablename = 'messages' and cmd <> 'SELECT'
 )
union all
-- 같은 이유로 **정책** 쪽도 본다. 위 권한 검사는 "grant" 만 보는데, 메시지 수정·삭제를
-- 여는 변이는 정책을 만든다("messages_edit_own" 등). 그쪽은 undo 로만 사라진다.
select '메시지 표에 갱신·삭제 정책이 남아 있다 (INV-M5)' as what
 where exists (
   select 1 from pg_policies
    where schemaname = 'public' and tablename = 'chat_messages'
      and cmd in ('UPDATE', 'DELETE')
 )
union all
-- 읽음 시각 트리거(INV-M2). 없으면 앱이 보내는 null 이 그대로 저장돼 모든 방이
-- 「전부 안 읽음」이 된다.
select '읽음 시각 트리거가 없다 (INV-M2, 0021)' as what
 where not exists (
   select 1 from pg_trigger
    where tgname = 'chat_participants_stamp_read' and not tgisinternal
 )
union all
-- 본문 제약 둘(INV-M3 · INV-M4).
select '메시지 본문 제약이 빠졌다 (INV-M3·M4, 0021)' as what
 where (select count(*) from pg_constraint
         where conrelid = 'public.chat_messages'::regclass
           and conname in ('chat_messages_content_length', 'chat_messages_content_no_control')) <> 2
union all
-- 아바타 정책의 경로 판정(INV-E3). 0015 가 목록에서 빠지면 복구가 끝난 자리에
-- 「남의 폴더를 차지할 수 있는」 상태가 도로 남는다.
select '아바타 쓰기 정책이 경로를 안 본다 (INV-E3)' as what
 where not exists (
   select 1 from pg_policies
    where schemaname = 'storage' and policyname = 'avatars_write_self'
      and strpos(with_check, 'foldername') > 0
 )
union all
-- 아바타 조회 정책의 목록 제한. 빠지면 회원 id 명부가 도로 열린다.
select '아바타 조회 정책이 목록을 안 막는다' as what
 where not exists (
   select 1 from pg_policies
    where schemaname = 'storage' and policyname = 'avatars_read'
      and strpos(qual, 'owner_id') > 0
 )
union all
-- 버킷의 형식·크기 제한(INV-E4)과 지역 외래 키(INV-E5).
select '아바타 버킷에 형식·크기 제한이 없다 (INV-E4)' as what
 where not exists (
   select 1 from storage.buckets
    where id = 'avatars' and file_size_limit is not null and allowed_mime_types is not null
 )
union all
select '지역 외래 키가 없다 (INV-E5)' as what
 where not exists (
   select 1 from pg_constraint where conname = 'profiles_region_fkey'
 )
union all
-- 실시간 주제 정규식도 같은 함정이다. 0012 가 목록에서 빠지거나 0010 앞으로 가면
-- 복구가 끝난 자리에 느슨한 조건이 도로 남는다. strpos 로 보는 이유는 like 의
-- 밑줄이 아무 글자나 먹어서 이 패턴을 헐겁게 만들기 때문이다.
select '실시간 주제 정규식이 느슨한 채로 남아 있다 (0012)' as what
 where exists (
   select 1 from pg_policies
    where schemaname = 'realtime' and tablename = 'messages' and policyname = 'chat_broadcast_read'
      and strpos(qual, '[0-9a-fA-F-]{36}') > 0
 )
union all
-- 0013 이 목록에서 빠지거나 0012 앞으로 가면 복구가 끝난 자리에 「모양 검사와 형변환이
-- and 로 묶인」 옛 조건이 남는다. 그 상태는 평가 순서가 뒤집히는 날 정책 평가 중에 오류를 낸다.
select '실시간 주제 검사가 chat_topic_uuid 를 안 거친다 (0013)' as what
 where not exists (
   select 1 from pg_policies
    where schemaname = 'realtime' and tablename = 'messages' and policyname = 'chat_broadcast_read'
      and strpos(qual, 'chat_topic_uuid') > 0
 )
union all
-- 0014 가 목록에서 빠지거나 0010 앞으로 가면, 복구가 끝난 자리에 「모집 중이 아닌 스터디에도
-- 새 모집글이 들어가는」 상태가 도로 남는다(INV-Z14). 정책의 with check 에 그 판정이 있는지로 본다.
select '모집글 삽입 정책이 모집 중인지를 안 본다 (INV-Z14, 0014)' as what
 where not exists (
   select 1 from pg_policies
    where schemaname = 'public' and tablename = 'posts' and policyname = 'posts_insert_author'
      and strpos(with_check, 'study_is_recruiting') > 0
 )
union all
-- 인덱스 셋도 0013 이 만든다. 없으면 비로그인 프로필 조회가 세 표를 통째로 훑는다
-- (실측: 1103 ms → 9 ms).
select '프로필 판정이 거는 조건에 인덱스가 없다 (0013): ' || i as what
  from unnest(array['posts_author_idx','chat_messages_sender_idx','studies_host_all_idx']) i
 where not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = i)
`;

async function restore(name) {
  const dir = join(HERE, "..", "supabase", "migrations");

  // **이름을 안 주면 등록된 undo 를 전부 돌린다.** 예전에는 하나도 안 돌면서 「복구 완료」를
  // 찍었다 — 손으로 심어 보고 파일 머리에 적힌 대로 되돌리면, 0001 에만 있는 정책을 건드리는
  // 변이(z2-self-accept · z8-chatpart-columns)가 심긴 채 남고 그 상태가 「복구됨」으로 보였다.
  // undo 는 전부 정책을 지웠다 다시 만드는 문장이라 몇 번 돌려도 같은 곳에 수렴한다.
  const undos = name
    ? [MUTATIONS[name]?.undo].filter(Boolean)
    : Object.values(MUTATIONS).map((m) => m.undo).filter(Boolean);
  // **데이터베이스 쪽 복구는 트랜잭션 하나다.** 어디서 죽든 껍데기도, 반쯤 걸린 정책도
  // 남지 않고 복구 전 상태로 되돌아간다. 복구 목록의 파일에는 트랜잭션 밖에서만 되는 문장
  // (`create index concurrently`·`vacuum`·`alter system`·`alter publication`)이 없다 —
  // 그런 문장이 들어오면 이 묶음이 바로 죽으므로 조용히 어긋나지는 않는다.
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    await c.query("begin");
    await c.query(RESTORE_PRELUDE);
    for (const f of RESTORE_MIGRATIONS) await c.query(readFileSync(join(dir, f), "utf-8"));
    for (const u of undos) await c.query(u);

    const leftover = await c.query(RESTORE_ASSERT);
    if (leftover.rowCount > 0) {
      throw new Error(
        "복구가 끝났는데 열린 채로 남은 것이 있다: " +
          leftover.rows.map((r) => r.what).join(", ") +
          "\n  RESTORE_MIGRATIONS 의 순서를 본다 — 0002·0004 가 판정 함수를 public 에 다시" +
          " 만들므로 0010 이 그 뒤여야 하고, 0011(프로필 조회 정책)이 0010 뒤여야 한다.",
      );
    }
    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }

  // 소스 파일을 바꾸는 변이는 **이름과 무관하게 전부** 되돌린다. 이름을 준 호출이 파일을
  // 건드리지 않으면, 크래시 뒤 `--restore <이름>` 으로 되돌린 사람은 파일이 변이된 채로
  // 남은 것을 모른 채 「복구 완료」를 본다. 되돌리기는 멱등이라 전부 도는 것이 안전하다.
  // **두 바퀴로 돈다.** 한 바퀴에서 「자기 것 되돌리고 바로 자기 것 검사」를 하면, 목록에서
  // 뒤에 있는 변이가 아직 심긴 상태로 앞 변이의 개수가 세어진다. 같은 파일을 건드리는 변이가
  // 둘 이상이고 서로의 줄이 겹치면 멀쩡한 복구가 「복구 실패」로 죽는다.
  let files = 0;
  for (const m of Object.values(MUTATIONS)) {
    if (!m.file) continue;
    const target = join(HERE, "..", m.file.path);
    const cur = readFileSync(target, "utf-8");
    if (!cur.includes(m.file.replace)) continue;
    writeFileSync(target, cur.split(m.file.replace).join(m.file.find));
    files += 1;
  }

  // **읽어서 확인한다.** 조건부 no-op 는 「되돌릴 것이 없었다」와 「되돌릴 문장을 못 찾았다」를
  // 구분하지 못한다 — 포매터가 그 줄을 건드리기만 해도 조용히 후자가 된다.
  //
  // 개수까지 세는 이유: 되돌리기는 replace 를 **전부** find 로 바꾼다. 그래서 replace 가
  // 깨끗한 소스에 원래 있던 문장이면, 복구가 손대지 않은 줄까지 바꿔 놓고 「복구 완료」를
  // 찍는다. 2026-09-05 에 실제로 났다 — 정렬 키 둘 중 하나가 다른 하나로 덮여서, 기준선이
  // 빨간불인 채로 변이 판정이 시작될 뻔했다. 있음/없음만 보면 그 상태가 그대로 통과한다.
  for (const [n, m] of Object.entries(MUTATIONS)) {
    if (!m.file) continue;
    const cur = readFileSync(join(HERE, "..", m.file.path), "utf-8");
    const found = cur.split(m.file.find).length - 1;
    const left = cur.split(m.file.replace).length - 1;
    if (found === 1 && left === 0) continue;
    // 원인이 둘인데 처방이 다르다. 뭉뚱그리면 안내가 틀린 쪽을 가리킨다.
    console.error(
      found === 0 && left === 0
        ? `복구 실패: ${n} 이 바꿀 문장을 ${m.file.path} 에서 못 찾았다 — 변이가 낡았다.\n` +
            "  고칠 곳은 소스가 아니라 이 파일의 find 문자열이다."
        : `복구 실패: ${n} 의 ${m.file.path} 가 깨끗한 모양이 아니다 ` +
            `(원래 문장 ${found}건 · 변이 문장 ${left}건 — 각각 1건과 0건이어야 한다).\n` +
            "  변이의 replace 가 깨끗한 소스에도 있는 문장이면 복구가 멀쩡한 줄까지 바꾼다.\n" +
            "  손으로 되돌린 뒤 다시 돌린다(git checkout 이 가장 빠르다).",
    );
    process.exit(1);
  }

  return { migrations: RESTORE_MIGRATIONS.length, undos: undos.length, sources: files };
}

const arg = process.argv[2];

if (!arg || arg === "--list") {
  for (const [name, m] of Object.entries(MUTATIONS)) {
    console.log(`${name.padEnd(26)} ${invOf(m).padEnd(7)} ${m.holds}`);
  }
} else if (arg === "--list-json") {
  // `file` 은 소스 파일을 바꾸는 변이인가다. 그런 변이는 데이터베이스 지문을 안 건드리므로,
  // 판정 쪽이 이것을 모르면 「강제 장치를 하나도 안 바꿨다」로 잘못 읽는다.
  // mutation-run.mjs 가 읽는 자리. 사람이 읽는 --list 의 칸 나눔에 기대지 않는다.
  // `suite` 는 이 변이를 어느 스위트가 붙드는가다. 유닛 변이(서버 액션의 가드·판정)를
  // 통합 스위트로 돌리면 그 스위트에는 붙들 검사가 아예 없어서 「빠져나갔다」가 나온다 —
  // 잡히지 않은 것과 잘못된 스위트를 돌린 것은 겉이 같다.
  const list = Object.entries(MUTATIONS).map(([name, m]) => ({
    name,
    inv: invOf(m),
    holds: m.holds,
    file: Boolean(m.file),
    suite: m.suite ?? "integration",
  }));
  console.log(JSON.stringify(list));
} else if (arg === "--fingerprint") {
  const r = await query(FINGERPRINT_SQL);
  const full = `${r.rows[0].fingerprint}\n${fileFingerprint()}`;
  // 마지막 줄에 요약 해시를 같이 낸다 — --restore 가 찍는 값과 같은 자리에서 만난다.
  console.log(full + `\nsha256 ${createHash("sha256").update(full).digest("hex").slice(0, 12)}`);
} else if (arg === "--restore") {
  // 이름을 주면 그 변이의 undo 만, 안 주면 전부 돌린다.
  const r = await restore(process.argv[3]);
  // 「복구 완료」라는 말만으로는 보고이지 근거가 아니다. 지문 요약을 같이 찍어
  // 사람이 원본과 대조할 수 있게 한다.
  const fp = `${(await query(FINGERPRINT_SQL)).rows[0].fingerprint}\n${fileFingerprint()}`;
  console.log(
    `복구 완료 (껍데기 1 + 마이그레이션 ${r.migrations}개 재적용 + undo ${r.undos}개 + 소스 ${r.sources}개) — 지문 ` +
      createHash("sha256").update(fp).digest("hex").slice(0, 12),
  );
} else {
  const mutation = MUTATIONS[arg];
  if (!mutation) {
    console.error(`모르는 변이: ${arg}. --list 로 목록을 본다.`);
    process.exit(1);
  }
  if (mutation.guard) await assertBodyFresh(arg, mutation.guard);
  if (mutation.sql) await query(mutation.sql);
  if (mutation.file) {
    const target = join(HERE, "..", mutation.file.path);
    const cur = readFileSync(target, "utf-8");

    // **심기 전에 검사한다.** 아래 둘은 복구도 검사하지만, 거기서 걸리면 작업 트리가 이미
    // 망가진 뒤라 안내가 「git checkout」이 된다. 심기 전에 보면 한 글자도 안 쓰고 거절된다.
    const found = cur.split(mutation.file.find).length - 1;
    if (found !== 1) {
      // **`found === 0` 의 원인은 둘이고 처방이 정반대다.** 변이가 낡은 것일 수도 있고,
      // 다른 파일 변이가 아직 심긴 채라 그 줄이 지금 다른 모양인 것일 수도 있다
      // (변이 둘의 find 가 겹치면 실제로 그렇게 된다). 뒤엣것에 "find 를 고쳐라"라고
      // 안내하면 멀쩡한 변이를 망친다 — 그래서 파일을 한 번 훑어 범인을 지목한다.
      const culprit =
        found === 0
          ? Object.entries(MUTATIONS).find(
              ([n, other]) =>
                n !== arg && other.file?.path === mutation.file.path && cur.includes(other.file.replace),
            )?.[0]
          : undefined;
      console.error(
        `${arg}: 바꿀 문장이 ${mutation.file.path} 에 ${found}건이다 — 1건이어야 한다.` +
          (culprit
            ? ` ${culprit} 가 아직 심긴 채다 — 먼저 \`node scripts/mutate.mjs --restore\` 로 되돌린다.`
            : found === 0
              ? " 변이가 낡았다 — 고칠 곳은 소스가 아니라 이 파일의 find 문자열이다."
              : " 같은 문장이 여럿이라 어디를 바꾸는지 정해지지 않는다."),
      );
      process.exit(1);
    }

    // **지금이 트리가 깨끗하다고 방금 확인된 순간이다.** 그러니 이 변이 하나가 아니라
    // 모든 파일 변이의 replace 를 여기서 한 번에 훑는다 — 비용이 0 이고, 한 번도 심어 본 적
    // 없는 변이의 잘못된 정의도 이때 드러난다.
    for (const [n, m] of Object.entries(MUTATIONS)) {
      if (!m.file || !cur.includes(m.file.replace)) continue;
      console.error(
        `${n}: 바꿔 넣을 문장이 깨끗한 소스(${m.file.path})에 이미 있다.` +
          " 복구는 그 문장을 전부 되돌리므로 손대지 않은 줄까지 바뀐다 — replace 를 소스에 없는 문장으로 고친다.",
      );
      process.exit(1);
    }

    // 변이 둘의 find 가 서로 겹치는 경우(하나가 다른 하나의 부분 문자열)는 여기서 안 본다.
    // 한 번에 하나만 심고 그 사이에 복구가 돌며, 복구가 **깨끗한 상태에서** 모든 변이의
    // 개수를 다시 세기 때문이다. 겹쳐서 심긴 상태는 위 `culprit` 가지가 이름을 대며 막는다.
    writeFileSync(target, cur.split(mutation.file.find).join(mutation.file.replace));

    // **디스크에서 다시 읽는다.** 방금 만든 문자열을 보면 위에서 `found === 1` 을 확인한
    // 이상 언제나 참이라, 확인처럼 생겼지만 아무것도 확인하지 않는다(쓰기 실패도 못 본다).
    if (!readFileSync(target, "utf-8").includes(mutation.file.replace)) {
      console.error(`${arg}: 심었는데 바꾼 문장이 파일에 없다.`);
      process.exit(1);
    }
  }
  console.log(`변이 심음: ${arg}\n  이것을 붙들어야 할 검사: ${mutation.holds}`);
}
