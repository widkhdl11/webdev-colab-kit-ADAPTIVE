// 근거: docs/specs/chat-message-integrity.md (INV-M1 ~ INV-M5) ·
//       supabase/migrations/0006_chat_broadcast.sql → 0010:292 → 0012:16 → 0013:59
//
// **이 파일이 붙드는 것은 「지금 닫혀 있다」는 사실 하나다.**
//
// 방 화면은 실시간으로 온 행을 **검증 없이** 목록에 넣는다
// (`src/features/chat/ui/ChatRoomView.tsx` 의 `broadcast` 처리 — 길이도 제어문자도
// `created_at` 도 안 본다). 0021 이 스키마에 건 제약 전부가 저 경로에는 하나도 안 걸린다.
//
// 그런데도 오늘 안 새는 이유는 **클라이언트가 그 주제로 쏠 수 없기 때문**이다.
// `realtime.messages` 에는 읽기 정책만 있고 쓰기 정책이 없다. 행 수준 보안이 켜진 표에서
// 정책이 없는 동작은 전부 거부된다 — 즉 이 안전은 화면이 지키는 것이 아니라 **정책이 없다는
// 사실**이 지킨다. 그 사실은 `for insert` 한 줄로 사라지고, 사라져도 아무 검사가 안 깨졌다.
//
// 여기가 열리면 0021 의 제약이 **화면 위에서만** 무력해진다. 저장은 안 되고 새로고침하면
// 사라지지만, 그 사이 남의 방 화면이 무너진다.
//
// **두 층을 따로 본다.** 정책 목록을 직접 묻는 검사(S-B1)는 결정론이고 되돌림을 정확히
// 잡는다. 실제로 쏴 보는 검사(S-B2)는 그 목록이 **정말 그 뜻인지**를 본다 — 목록만 보면
// 「정책이 없으면 거부된다」가 내 믿음인지 데이터베이스의 동작인지 갈리지 않는다.

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

let sender: TestUser;
let listener: TestUser;
let chatId: string;
let db: Client;

/** 듣는 쪽 채널. 검사 둘이 같은 구독을 쓴다 — 새로 열 때마다 붙는 시간이 든다. */
let 듣는채널: RealtimeChannel;
/** 이 채널로 들어온 `new_message` 방송의 payload 장부. */
const 받은것: unknown[] = [];

/** 실시간 연결에 로그인 토큰을 실어 준다. 안 실으면 private 주제에 못 붙는다. */
async function 토큰실기(client: SupabaseClient): Promise<void> {
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("세션이 없다 — 로그인한 연결이어야 한다");
  await client.realtime.setAuth(token);
}

/** 주어진 시간 동안 기다린다. 「아무것도 안 온다」는 판정은 기다림 없이는 못 한다. */
const 기다린다 = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 방송이 하나 들어올 때까지, 또는 시간이 다 될 때까지 기다린다.
 * **개수로 기다린다** — 「하나라도 있나」로 기다리면 앞 검사가 남긴 것을 다시 센다.
 */
async function 방송을기다린다(목표개수: number, 제한ms: number): Promise<boolean> {
  const 끝 = Date.now() + 제한ms;
  while (Date.now() < 끝) {
    if (받은것.length >= 목표개수) return true;
    await 기다린다(50);
  }
  return false;
}

beforeAll(async () => {
  db = await rawClient();
  sender = await createUser("t-bcast-sender");
  listener = await createUser("t-bcast-listener");

  const studyId = await createStudy(sender.id);
  await acceptedMember(studyId, listener.id);
  chatId = await chatIdOf(studyId);

  await 토큰실기(sender.client);
  await 토큰실기(listener.client);

  듣는채널 = listener.client
    .channel(`chat:${chatId}`, { config: { private: true } })
    .on("broadcast", { event: "new_message" }, (m) => {
      받은것.push(m.payload);
    });

  await new Promise<void>((resolve, reject) => {
    const 포기 = setTimeout(() => reject(new Error("실시간 구독이 안 붙었다")), 20_000);
    듣는채널.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(포기);
        resolve();
      }
    });
  });

  // **「SUBSCRIBED」는 방송이 흐른다는 뜻이 아니다.** 실시간 서버는 첫 private 구독을 받고
  // 나서야 복제를 시작하는데(컨테이너 로그의 `Starting stream replication`), 그 사이에
  // 들어온 행은 아무에게도 안 간다. 여기서 예열을 안 하면 그 틈이 **아래 검사에 그대로
  // 옮겨 붙는다** — 진짜 메시지도 안 오는 상태에서 「지어낸 방송도 안 왔다」가 성립한다.
  //
  // 그래서 진짜 메시지가 한 번 도착하는 것을 본 뒤에 검사를 시작한다. 못 보면 던진다 —
  // 이 파일의 판정이 전부 「안 온다」이므로, 길이 죽은 채로 도는 것이 가장 나쁜 결과다.
  let 예열됨 = false;
  for (let 시도 = 0; 시도 < 5 && !예열됨; 시도 += 1) {
    받은것.length = 0;
    const { error } = await admin
      .from("chat_messages")
      .insert({ chat_id: chatId, sender_id: sender.id, content: `예열 ${시도}` });
    if (error) throw new Error(`예열 메시지 삽입 실패: ${error.message}`);
    예열됨 = await 방송을기다린다(1, 6_000);
  }
  if (!예열됨) throw new Error("실시간 방송이 한 번도 안 왔다 — 이 파일의 판정이 성립하지 않는다");
});

afterAll(async () => {
  await listener.client.removeAllChannels();
  await sender.client.removeAllChannels();
  listener.client.realtime.disconnect();
  sender.client.realtime.disconnect();
  await db.end();
  await cleanupCreatedUsers();
});

describe("실시간 방송에 클라이언트가 쓸 수 있나", () => {
  it("S-B1: `realtime.messages` 의 정책은 읽기뿐이다 — 목록으로 단언한다", async () => {
    const r = await db.query<{ cmd: string; policyname: string }>(
      `select cmd, policyname from pg_policies
        where schemaname = 'realtime' and tablename = 'messages'
        order by policyname`,
    );

    // **목록으로 단언하는 이유**: 「읽기 정책이 있다」만 보면 그 옆에 쓰기 정책이 생겨도
    // 초록불이다. 이 표에 있어도 되는 것이 무엇인지를 적는다.
    expect(r.rows.map((x) => x.cmd)).toEqual(["SELECT"]);

    // 정책이 아예 없으면 위 단언이 `[]` 로 통과해 버린다 — 그때는 아무도 못 **읽는다**는
    // 뜻이고 방 화면의 실시간이 통째로 죽은 상태다. 하나는 있어야 한다.
    expect(r.rows).toHaveLength(1);
  });

  it("S-B2: 행 수준 보안이 켜져 있다 — 정책이 없다는 사실이 거부로 이어지는 전제", async () => {
    const r = await db.query<{ relrowsecurity: boolean }>(
      `select relrowsecurity from pg_class
        where oid = 'realtime.messages'::regclass`,
    );

    // 이것이 꺼지면 정책이 없어도 전부 통과한다. S-B1 의 목록은 그대로인 채 방벽만 사라진다.
    expect(r.rows[0]?.relrowsecurity).toBe(true);
  });

  it("S-B3: 진짜 메시지는 듣는 쪽에 도착한다 — 아래 검사의 대조군", async () => {
    받은것.length = 0;

    const { error } = await sender.client
      .from("chat_messages")
      .insert({ chat_id: chatId, sender_id: sender.id, content: "진짜 메시지" });
    expect(error).toBeNull();

    // **이 검사가 없으면 S-B4 는 아무 뜻이 없다.** 실시간이 그냥 안 붙어 있어도
    // 「아무것도 안 왔다」가 성립하기 때문이다.
    expect(await 방송을기다린다(1, 15_000)).toBe(true);
    expect((받은것[0] as { record?: { content?: string } }).record?.content).toBe("진짜 메시지");
  });

  it("S-B4: 멤버가 직접 쏜 방송은 남의 화면에 안 닿는다", async () => {
    받은것.length = 0;

    const 쏘는채널 = sender.client.channel(`chat:${chatId}`, { config: { private: true } });
    await new Promise<void>((resolve, reject) => {
      const 포기 = setTimeout(() => reject(new Error("보내는 쪽 구독이 안 붙었다")), 20_000);
      쏘는채널.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(포기);
          resolve();
        }
      });
    });

    // 화면이 그대로 믿고 그리는 모양 그대로 지어낸다 — 0021 이 막는 것을 전부 어긴다.
    const 지어낸행 = {
      id: "00000000-0000-4000-8000-000000000000",
      sender_id: sender.id,
      content: "\n".repeat(50) + "지어낸 메시지",
      created_at: "2099-01-01T00:00:00.000Z",
    };
    const 결과 = await 쏘는채널.send({
      type: "broadcast",
      event: "new_message",
      payload: { record: 지어낸행 },
    });

    // **`send` 의 답을 판정의 근거로 삼지 않는다.** 거부돼도 `ok` 가 올 수 있다 —
    // 방송은 답을 기다리지 않는 경로다. 기록만 하고, 판정은 듣는 쪽으로 한다.
    await 기다린다(3_000);
    expect(받은것, `보내는 쪽이 받은 답: ${결과}`).toEqual([]);

    await sender.client.removeChannel(쏘는채널);
  });

  it("S-B5: 지어낸 행은 저장도 안 됐다 — 방송 경로가 표를 안 지난다", async () => {
    const r = await admin
      .from("chat_messages")
      .select("id")
      .eq("id", "00000000-0000-4000-8000-000000000000");

    expect(r.data).toEqual([]);
  });
});
