// 근거 스펙: docs/specs/chat-message-integrity.md (INV-M1 ~ INV-M5) ·
//            supabase/migrations/0021_chat_message_integrity.sql
//
// 여기서 판정하는 것은 전부 **폼과 서버 액션을 안 지나는 쓰기**다. `member.client` 는
// 공개 키로 로그인한 연결이고, 그 키는 브라우저 번들에도 들어가는 값이라 이 연결로
// 할 수 있는 일이 곧 "방 멤버 아무나 할 수 있는 일"이다. 앱의 `MESSAGE_MAX` 검사와
// `insertMessage` 의 `trim()` 은 이 경로에 없다.

import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MESSAGE_MAX } from "@/features/chat/model/limits";
import {
  acceptedMember,
  admin,
  chatIdOf,
  cleanupCreatedUsers,
  createStudy,
  createUser,
  rawClient,
  type TestUser,
} from "./helpers";

let member: TestUser;
let outsider: TestUser;
let chatId: string;

/** 읽음 시각 검사 전용 방 둘. 다른 검사가 넣는 메시지가 안 읽은 수를 흔들지 않게 갈라 둔다. */
let readChatId: string;
/** **한 번도 안 읽은** 방 — `last_read_at` 이 null 이다(0001 에 기본값이 없다). */
let freshChatId: string;

/** 데이터베이스에 직접 붙는 연결 하나. 검사마다 열고 닫으면 왕복만 늘어난다. */
let db: Client;

/**
 * **데이터베이스의 지금**. 앱 시계로 재면 INV-M2 가 재려는 것(두 시계가 어긋나는 일)을
 * 검사 자신이 저지르게 된다 — 스큐가 그대로 판정 오차가 되고, 어느 쪽이 틀렸는지 못 가른다.
 */
async function dbNow(): Promise<Date> {
  const r = await db.query<{ now: Date }>("select now() as now");
  return r.rows[0].now;
}

/** 그 방에 그 본문을 가진 행이 몇 개인가. 「거부됐다」의 반대편을 확인할 때 쓴다. */
async function countByContent(chat: string, content: string): Promise<number> {
  const { count, error } = await admin
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("chat_id", chat)
    .eq("content", content);
  if (error) throw new Error(`메시지 세기 실패: ${error.message}`);
  return count ?? 0;
}

/**
 * 그 방의 전체 메시지 수. 본문이 길면 `countByContent` 를 못 쓴다 — 조건이 주소줄에
 * 실려서 2001자짜리 본문은 요청 자체가 「주소가 너무 길다」로 죽고, 그러면 제약이
 * 무슨 일을 했는지가 아니라 검사의 사정이 판정이 된다.
 */
async function countInChat(chat: string): Promise<number> {
  const { count, error } = await admin
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("chat_id", chat);
  if (error) throw new Error(`메시지 세기 실패: ${error.message}`);
  return count ?? 0;
}

/** 그 방에서 그 사람의 읽음 시각. null 이면 null 그대로 준다 — 그 자체가 판정 대상이다. */
async function lastReadAt(chat: string, userId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("chat_participants")
    .select("last_read_at")
    .eq("chat_id", chat)
    .eq("user_id", userId)
    .single();
  if (error) throw new Error(`읽음 시각 조회 실패: ${error.message}`);
  return (data.last_read_at as string | null) ?? null;
}

/** 앱이 실제로 보내는 모양 그대로 읽음 표시를 누른다 (`mark-read.ts` 의 `STAMPED_BY_DB`). */
async function markReadLikeTheApp(chat: string) {
  return member.client
    .from("chat_participants")
    .update({ last_read_at: null })
    .eq("chat_id", chat)
    .eq("user_id", member.id);
}

beforeAll(async () => {
  db = await rawClient();

  const host = await createUser("t-msg-host");
  member = await createUser("t-msg-member");
  outsider = await createUser("t-msg-out");

  const studyId = await createStudy(host.id);
  await acceptedMember(studyId, member.id);
  chatId = await chatIdOf(studyId);

  const readStudyId = await createStudy(host.id, { title: "읽음 시각 검사용" });
  await acceptedMember(readStudyId, member.id);
  readChatId = await chatIdOf(readStudyId);

  const freshStudyId = await createStudy(host.id, { title: "한 번도 안 읽은 방" });
  await acceptedMember(freshStudyId, member.id);
  freshChatId = await chatIdOf(freshStudyId);
}, 60_000);

afterAll(async () => {
  await db.end();
  await cleanupCreatedUsers();
});

// ─────────────────────────────────────────────────────────────────────────
// INV-M1 — 요청이 이름 붙일 수 있는 열은 셋뿐이다
// ─────────────────────────────────────────────────────────────────────────
describe("INV-M1: 메시지 행에서 요청이 정할 수 있는 열은 셋뿐이다", () => {
  it("INV-M1 (S1): created_at 을 실은 직접 삽입은 거부된다", async () => {
    const content = "과거에서 온 문장";
    const { error } = await member.client.from("chat_messages").insert({
      chat_id: chatId,
      sender_id: member.id,
      content,
      created_at: "2020-01-01T00:00:00Z",
    });

    expect(
      error,
      "created_at 을 실은 삽입이 통과했다 — 과거 시각이면 남의 대화 중간에 끼어들고 안 읽음에도 안 잡힌다",
    ).not.toBeNull();
    // **거부만 보면 부족하다.** 오류를 냈는데 행은 들어간 조합이 있을 수 있다.
    expect(await countByContent(chatId, content)).toBe(0);
  });

  it("INV-M1 (S1b): id 를 직접 지정한 삽입은 거부된다", async () => {
    const content = "내가 고른 id";
    const { error } = await member.client.from("chat_messages").insert({
      chat_id: chatId,
      sender_id: member.id,
      content,
      id: "00000000-0000-4000-8000-000000000001",
    });

    expect(error, "id 를 직접 정하는 삽입이 통과했다").not.toBeNull();
    expect(await countByContent(chatId, content)).toBe(0);
  });

  it("INV-M1 (S1c): 허용된 열 셋만 보내면 들어가고, created_at 은 데이터베이스의 지금이다", async () => {
    // **반대 절반이다.** 위 둘만 있으면 삽입 권한을 통째로 거두는 변이가 통과한다 —
    // 그러면 채팅이 아예 안 되는데 검사는 전부 초록불이다.
    const before = await dbNow();
    const content = "평범한 메시지";
    const { error } = await member.client
      .from("chat_messages")
      .insert({ chat_id: chatId, sender_id: member.id, content });
    expect(error, `허용된 열 셋만 보낸 삽입이 거부됐다: ${error?.message}`).toBeNull();
    const after = await dbNow();

    const { data } = await admin
      .from("chat_messages")
      .select("created_at")
      .eq("chat_id", chatId)
      .eq("content", content)
      .single();
    const at = new Date(data!.created_at as string).getTime();
    expect(at).toBeGreaterThanOrEqual(before.getTime());
    expect(at).toBeLessThanOrEqual(after.getTime());
  });

  it("INV-M1 (S1d): 방 멤버가 아니면 허용된 열 셋만 보내도 거부된다", async () => {
    // 열을 좁히면서 기존 삽입 정책이 죽지 않았는지 본다. 권한과 정책은 다른 층이라
    // 한쪽을 고치다 다른 쪽을 지워도 위 검사들은 그대로 초록불이다.
    const content = "남의 방에 넣는 문장";
    const { error } = await outsider.client
      .from("chat_messages")
      .insert({ chat_id: chatId, sender_id: outsider.id, content });

    expect(error, "방 멤버가 아닌 사람의 삽입이 통과했다").not.toBeNull();
    expect(await countByContent(chatId, content)).toBe(0);
  });

  it("INV-M1 (S1e): 허용된 열 집합 자체를 권한에 대고 묻는다", async () => {
    // **행동 검사만으로는 열 목록이 안 고정된다.** 위 넷은 「created_at 을 실으면 거부」와
    // 「셋만 보내면 통과」를 보는데, 목록에 다른 열을 더하는 변경은 그 둘을 다 통과시킨다.
    // 그리고 `anon` 쪽 절반은 행동으로 아예 못 잰다 — 삽입 정책이 `sender_id = auth.uid()`
    // 를 보고 비로그인은 그 값이 null 이라 **정책이 대신 거부해서** 권한이 열려 있어도
    // 초록불이 나온다. 0021 이 anon 권한을 거둔 이유가 「정책 한 줄을 고치면 곧바로
    // 열린다」이므로, 그 층을 직접 물어야 한다. (2026-09-10 test-auditor · code-reviewer)
    const r = await db.query<{ grantee: string; column_name: string }>(
      `select grantee, column_name
         from information_schema.column_privileges
        where table_schema = 'public' and table_name = 'chat_messages'
          and privilege_type = 'INSERT' and grantee in ('anon', 'authenticated')`,
    );

    const byRole = new Map<string, Set<string>>();
    for (const row of r.rows) {
      if (!byRole.has(row.grantee)) byRole.set(row.grantee, new Set());
      byRole.get(row.grantee)!.add(row.column_name);
    }

    expect(byRole.get("authenticated") ?? new Set(), "삽입할 수 있는 열 목록이 셋이 아니다").toEqual(
      new Set(["chat_id", "sender_id", "content"]),
    );
    expect(
      byRole.get("anon"),
      "anon 에 삽입 권한이 남아 있다 — 정책 한 줄만 고치면 비로그인도 쓸 수 있게 된다",
    ).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// INV-M2 — 안 읽은 수를 가르는 두 시각은 같은 시계에서 나온다
// ─────────────────────────────────────────────────────────────────────────
describe("INV-M2: 읽음 시각은 데이터베이스가 찍는다", () => {
  it("INV-M2 (S2): 앱이 보내는 자리 표시(null)로 눌러도 데이터베이스가 시각을 찍는다", async () => {
    // **이 검사가 제일 중요하다.** 아래 S2b 는 미래 시각을 실어 보내는데, 앱이 실제로
    // 보내는 값은 `null` 이다(`mark-read.ts` 의 `STAMPED_BY_DB`). 트리거를 「값이 달라졌을
    // 때만 찍는다」로 좁히면 미래 시각은 계속 덮이지만 null → null 은 안 덮이고, 그러면
    // **모든 방의 첫 읽음**이 값 없이 지나간다. `read-chats.ts:132` 가 null 일 때 `.gt()` 를
    // 안 걸어 그 방의 모든 메시지를 안 읽음으로 세므로, 배지가 영원히 안 꺼진다.
    // 오류는 아무 데도 안 난다. (2026-09-10 test-auditor · code-reviewer)
    await admin
      .from("chat_messages")
      .insert({ chat_id: freshChatId, sender_id: member.id, content: "읽기 전에 온 문장" });
    expect(
      await lastReadAt(freshChatId, member.id),
      "준비물이 틀렸다 — 이 방은 아직 안 읽은 방이어야 한다",
    ).toBeNull();

    const before = await dbNow();
    const { error } = await markReadLikeTheApp(freshChatId);
    expect(error, `읽음 표시가 실패했다: ${error?.message}`).toBeNull();
    const after = await dbNow();

    const stored = await lastReadAt(freshChatId, member.id);
    expect(stored, "null 이 그대로 남았다 — 그 방은 모든 메시지가 영원히 안 읽음이다").not.toBeNull();
    const at = new Date(stored!).getTime();
    expect(at).toBeGreaterThanOrEqual(before.getTime());
    expect(at).toBeLessThanOrEqual(after.getTime());

    // 반대 절반: 읽기 전에 온 메시지는 이제 안 읽음이 아니다.
    const { count } = await admin
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("chat_id", freshChatId)
      .gt("created_at", stored!);
    expect(count, "읽음 표시를 했는데 그 전에 온 메시지가 아직 안 읽음이다").toBe(0);
  });

  it("INV-M2 (S2c): 두 번째 읽음 표시는 시각을 앞으로 민다", async () => {
    // 위 검사는 「null 에서 값이 생긴다」까지만 본다. 트리거를
    // `coalesce(old.last_read_at, now())` 로 쓰거나 「이미 값이 있으면 건너뛴다」로 쓰면
    // 첫 읽음은 통과하고 그 뒤로 시각이 멈춘다 — 그 방은 한 번 읽은 뒤로 새 메시지가
    // 영원히 안 읽음으로 남는다. (2026-09-10 test-auditor)
    const first = await lastReadAt(freshChatId, member.id);
    expect(first, "앞 검사가 값을 남겼어야 한다").not.toBeNull();

    const { error } = await markReadLikeTheApp(freshChatId);
    expect(error).toBeNull();

    const second = await lastReadAt(freshChatId, member.id);
    expect(
      new Date(second!).getTime(),
      "다시 읽었는데 시각이 안 나아갔다 — 그 뒤에 오는 메시지가 영원히 안 읽음으로 남는다",
    ).toBeGreaterThan(new Date(first!).getTime());
  });

  it("INV-M2 (S2b): 읽음 시각에 미래를 실어도 데이터베이스가 자기 시각으로 덮는다", async () => {
    const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const before = await dbNow();
    const { error } = await member.client
      .from("chat_participants")
      .update({ last_read_at: future })
      .eq("chat_id", readChatId)
      .eq("user_id", member.id);
    expect(error, `읽음 표시가 실패했다: ${error?.message}`).toBeNull();
    const after = await dbNow();

    const at = new Date((await lastReadAt(readChatId, member.id))!).getTime();
    expect(at, "요청이 보낸 미래 시각이 그대로 저장됐다").toBeLessThanOrEqual(after.getTime());
    expect(at).toBeGreaterThanOrEqual(before.getTime());
  });

  it("INV-M2 (S2d): 미래 시각을 실어도 그 뒤에 온 메시지가 안 읽은 수에 잡힌다", async () => {
    // 위 검사가 막는 것의 **손해 쪽**이다. 미래 시각이 저장되면 그 뒤 일주일간 온
    // 메시지가 `.gt(created_at, last_read_at)` 에 하나도 안 걸린다 — 배지가 영원히
    // 안 켜지는데 오류는 아무 데도 안 난다 (`read-chats.ts:132`).
    const stored = await lastReadAt(readChatId, member.id);

    const { error } = await admin
      .from("chat_messages")
      .insert({ chat_id: readChatId, sender_id: member.id, content: "읽은 뒤에 온 문장" });
    expect(error).toBeNull();

    const { count } = await admin
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("chat_id", readChatId)
      .gt("created_at", stored!);

    expect(count, "읽음 표시 뒤에 온 메시지가 안 읽은 수에 안 잡힌다").toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// INV-M3 — 본문은 공백을 뺀 내용이 있고 MESSAGE_MAX 자 이하다
// ─────────────────────────────────────────────────────────────────────────
describe("INV-M3: 메시지 본문의 길이는 데이터베이스가 지킨다", () => {
  // 경계를 양쪽에서 민다. 「길면 거부」만 보면 상한을 늘리는 변이가 통과하고,
  // 「상한값은 통과」만 보면 제약을 통째로 빼는 변이가 통과한다. **검사를 둘로 나눈다** —
  // 하나로 묶으면 앞 단언이 실패할 때 vitest 가 거기서 멈춰 뒤 갈래를 아예 안 재고,
  // 넓히는 변이와 좁히는 변이가 같은 이름의 검사 하나를 깨뜨려 귀속이 엉킨다
  // (2026-09-10 test-auditor).
  //
  // 앱의 상수로 미는 이유는 0020 과 같다 — 스키마와 `MESSAGE_MAX` 가 갈라지면 입력창은
  // 받아 놓고 데이터베이스가 거부하거나(보내기를 누른 뒤에야 막힌다), 반대로 스키마만
  // 넓어져 이 검사가 앱과 무관한 숫자를 재게 된다.
  it("INV-M3 (S3b): 상한과 같은 길이는 그대로 들어간다", async () => {
    const at = "가".repeat(MESSAGE_MAX);
    const { error } = await member.client
      .from("chat_messages")
      .insert({ chat_id: chatId, sender_id: member.id, content: at });
    expect(error, `${MESSAGE_MAX}자가 거부됐다 — 스키마의 상한이 앱보다 좁다`).toBeNull();
  });

  it("INV-M3 (S3): 상한을 한 글자 넘기면 안 들어간다", async () => {
    const over = "나".repeat(MESSAGE_MAX + 1);
    const before = await countInChat(chatId);
    const { error } = await member.client
      .from("chat_messages")
      .insert({ chat_id: chatId, sender_id: member.id, content: over });
    expect(error, `${MESSAGE_MAX + 1}자가 들어갔다 — 상한을 지키는 곳이 앱뿐이다`).not.toBeNull();
    expect(await countInChat(chatId), "거부됐다는데 행은 늘었다").toBe(before);
  });

  it("INV-M3 (S3c): 공백만으로 된 본문은 거부된다", async () => {
    // `char_length` 만 보는 제약은 여기서 통과한다. 폼은 `trim()` 이 막지만,
    // 이 파일이 막으려는 것이 그 폼을 안 지나는 경로다.
    const blank = "   ";
    const { error } = await member.client
      .from("chat_messages")
      .insert({ chat_id: chatId, sender_id: member.id, content: blank });

    expect(
      error,
      "공백만으로 된 메시지가 들어갔다 — 빈 말풍선이 되고 목록의 마지막 메시지 자리를 차지한다",
    ).not.toBeNull();
    expect(await countByContent(chatId, blank)).toBe(0);
  });

  it("INV-M3 (S3d): 눈에 안 보이는 다른 공백만으로 된 본문도 거부된다", async () => {
    // **`btrim` 은 U+0020 하나만 자른다.** 0010 이 사용자 이름에서 실측해 적어 둔 함정이고
    // (`0010:56-67`), 0021 도 처음엔 `btrim` 으로 썼다. 이 검사가 없으면 그 모양으로
    // 되돌리는 변경이 통과하고, 전각 공백 세 칸짜리 빈 말풍선이 방에 들어간다.
    // 폼은 JS `trim()` 이 이 셋을 자르므로 안 걸린다 — 즉 폼 밖 경로만 뚫린다.
    // (2026-09-10 security-reviewer)
    //
    // 이스케이프로 적는다 — 눈에 안 보이는 글자를 소스에 그대로 박으면 파일을 옮기는
    // 과정에 조용히 사라지고, 그러면 이 검사가 평범한 빈 문자열을 재게 된다.
    const 빈칸들 = [
      ["전각 공백(U+3000) 세 칸", "\u3000\u3000\u3000"],
      ["줄바꿈 없는 공백(U+00A0) 하나", "\u00A0"],
      ["바이트 순서 표시(U+FEFF) 하나", "\uFEFF"],
    ] as const;

    for (const [이름, blank] of 빈칸들) {
      const { error } = await member.client
        .from("chat_messages")
        .insert({ chat_id: chatId, sender_id: member.id, content: blank });
      expect(error, `${이름}으로만 된 메시지가 들어갔다`).not.toBeNull();
      expect(await countByContent(chatId, blank)).toBe(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// INV-M4 — 본문에 제어문자가 없다
// ─────────────────────────────────────────────────────────────────────────
describe("INV-M4: 메시지 본문에 제어문자가 안 들어간다", () => {
  it("INV-M4 (S4): 줄바꿈이 든 본문은 거부된다", async () => {
    // 말풍선은 `white-space: pre-wrap` 으로 그린다
    // (`src/features/chat/ui/chat-room.module.css:97`). 상한을 전부 줄바꿈으로 채우면
    // 말풍선 하나가 화면 수십 개 높이가 되고, 그 방을 연 사람은 다른 대화를 못 찾는다.
    const content = "첫 줄\n둘째 줄";
    const { error } = await member.client
      .from("chat_messages")
      .insert({ chat_id: chatId, sender_id: member.id, content });

    expect(error, "줄바꿈이 든 메시지가 들어갔다").not.toBeNull();
    expect(await countByContent(chatId, content)).toBe(0);
  });

  it("INV-M4 (S4c): 줄바꿈 말고 다른 제어문자도 거부된다", async () => {
    // 줄바꿈 하나만 막는 제약으로 좁혀 쓰는 변이를 여기서 잡는다.
    // 넣는 글자는 U+0007 이다 — 널 문자(U+0000)는 PostgreSQL 이 text 에 아예 못 담아서
    // 제약이 없어도 거부되고, 그러면 이 검사가 제약을 안 재고도 초록불이 된다.
    //
    // **이스케이프로 적는다.** 제어문자를 소스에 그대로 박으면 파일을 옮기거나 붙여 넣는
    // 과정에 조용히 사라진다(2026-09-06 실측 · 2026-09-10 code-reviewer).
    const content = "보이지 않는\u0007글자";
    const { error } = await member.client
      .from("chat_messages")
      .insert({ chat_id: chatId, sender_id: member.id, content });

    expect(error, "제어문자가 든 메시지가 들어갔다").not.toBeNull();
    expect(await countByContent(chatId, content)).toBe(0);
  });

  it("INV-M4 (S4b): 평범한 한 줄은 그대로 들어간다", async () => {
    // 반대 절반. 제약을 「본문을 전부 거부」로 잘못 써도 위 둘은 초록불이다.
    // 입력창이 한 줄짜리 `<input>` 이라(`ChatRoomView.tsx:214`) 폼이 만들 수 있는 본문은
    // 이 모양뿐이고, 이 제약은 그중 하나도 막지 않아야 한다.
    const content = "안녕하세요, 내일 몇 시에 모이나요?";
    const { error } = await member.client
      .from("chat_messages")
      .insert({ chat_id: chatId, sender_id: member.id, content });

    expect(error, `평범한 메시지가 거부됐다: ${error?.message}`).toBeNull();
    expect(await countByContent(chatId, content)).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// INV-M5 — 저장된 메시지는 수정도 삭제도 안 된다
// ─────────────────────────────────────────────────────────────────────────
describe("INV-M5: 저장된 메시지는 바뀌지 않는다", () => {
  // **거부되는 방식이 아니라 결과를 단언한다.** 오늘 이것을 막는 것은 두 층이다 —
  // 갱신·삭제 정책이 없고(0행이 돌아온다), 0021 이 표 권한도 거뒀다(42501 이 온다).
  // `expect(error).toBeNull()` 로 적으면 **불변식을 더 강하게 만드는 변경이 검사를
  // 깨뜨린다** — 방벽을 하나 더 세운 날 빨간불이 나면 다음 사람은 방벽을 뺀다.
  // (2026-09-10 test-auditor · security-reviewer)
  async function myMessage(content: string): Promise<string> {
    const { data, error } = await admin
      .from("chat_messages")
      .insert({ chat_id: chatId, sender_id: member.id, content })
      .select("id")
      .single();
    if (error) throw new Error(`준비물 생성 실패: ${error.message}`);
    return data.id as string;
  }

  it("INV-M5 (S5): 자기가 보낸 메시지도 고칠 수 없다", async () => {
    const id = await myMessage("고치기 전 문장");
    const { data, error } = await member.client
      .from("chat_messages")
      .update({ content: "고친 뒤 문장" })
      .eq("id", id)
      .select("id");

    // 거부됐거나(권한) 아무 행도 안 바뀌었거나(정책 없음) — 둘 중 하나면 된다.
    expect(
      error !== null || (data ?? []).length === 0,
      "메시지 갱신이 통과했다 — 남이 읽은 뒤에 말을 바꿀 수 있다",
    ).toBe(true);

    const { data: row } = await admin.from("chat_messages").select("content").eq("id", id).single();
    expect(row!.content, "원본이 바뀌었다").toBe("고치기 전 문장");
  });

  it("INV-M5 (S5b): 자기가 보낸 메시지도 지울 수 없다", async () => {
    const id = await myMessage("지우기 전 문장");
    const { data, error } = await member.client
      .from("chat_messages")
      .delete()
      .eq("id", id)
      .select("id");

    expect(error !== null || (data ?? []).length === 0, "메시지 삭제가 통과했다").toBe(true);

    const { count } = await admin
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("id", id);
    expect(count, "원본이 지워졌다").toBe(1);
  });

  it("INV-M5 (S5d): 이 표에 갱신·삭제 권한이 남아 있지 않다", async () => {
    // **0021 이 거둔 권한은 오늘 동작을 안 바꾼다** — 정책이 없어 이미 거부되기 때문이다.
    // 그래서 행동 검사로는 못 잰다. 그 방벽이 막는 것은 나중이다: 「내 메시지 수정」 정책
    // 한 줄을 더하는 날, 권한이 남아 있으면 같은 요청이 `content` 만이 아니라 `chat_id` ·
    // `created_at` · `sender_id` 까지 SET 에 실을 수 있다. 권한 목록을 직접 물어야
    // 그 방벽이 고정된다. (2026-09-10 security-reviewer)
    const r = await db.query<{ privilege_type: string }>(
      `select distinct privilege_type
         from information_schema.table_privileges
        where table_schema = 'public' and table_name = 'chat_messages'
          and grantee in ('anon', 'authenticated')
          and privilege_type in ('UPDATE', 'DELETE')`,
    );
    expect(
      r.rows.map((x) => x.privilege_type),
      "갱신·삭제 권한이 남아 있다 — 수정 정책 한 줄이 열의 전부를 같이 연다",
    ).toEqual([]);
  });

  it("INV-M5 (S5c): 이 표에 걸린 정책은 읽기와 넣기 둘뿐이다", async () => {
    // **위 둘은 직접 경로만 본다.** 나중에 `security definer` 함수로 수정 기능이 들어오면
    // 그 함수는 정책을 우회하므로 위 검사는 초록불인 채 INV-M5 가 깨진다. 정책 목록을
    // 직접 물으면 「무엇이 열려 있는가」가 한 자리에서 고정된다.
    // (2026-09-10 security-reviewer)
    const r = await db.query<{ cmd: string }>(
      `select distinct cmd from pg_policies
        where schemaname = 'public' and tablename = 'chat_messages'`,
    );
    expect(
      new Set(r.rows.map((x) => x.cmd)),
      "chat_messages 에 읽기·넣기 말고 다른 정책이 생겼다",
    ).toEqual(new Set(["SELECT", "INSERT"]));
  });
});
