import { createServerSupabase } from "@/shared/api/supabase/server-client";
import { chatRoomQuery, myChatsQuery } from "./chat-select";

/**
 * 방이 딸린 스터디. **넷이 다 같은 하나에서 나온다** — 스터디 행이 보이는가.
 * 그래서 필드를 따로 두지 않고 갈래로 나눈다. 그러지 않으면
 * { available: true, memberCount: null } 같은 있을 수 없는 상태가 타입을 통과하고,
 * 화면이 그 조합에서 「멤버 명」을 그린다.
 *
 * available: false 가 뜻하는 것은 정확히 **안 보인다**이다. 지금은 조회 정책이
 * "지워지지 않았거나 내가 호스트" 라서 멤버 시점에서 그것이 곧 「지워졌다」와 같지만,
 * 정책이 좁아지면(예: 비공개 스터디) 두 말이 갈라진다. 화면 문구를 정하는 것은 화면이다.
 */
export type ChatStudy =
  | {
      readonly available: true;
      readonly id: string;
      readonly title: string;
      readonly categoryId: string;
      readonly memberCount: number;
    }
  | { readonly available: false; readonly id: string };

export type ChatRoom = {
  readonly id: string;
  readonly study: ChatStudy;
  readonly lastMessage: string | null;
  readonly lastMessageAt: string | null;
  /** 마지막으로 읽은 시각 뒤에 온 메시지 수. 저장하지 않고 센다 */
  readonly unread: number;
};

/**
 * 임베드 응답을 갈래로 바꾼다. 응답은 신뢰 경계 밖이라 **화면이 실제로 그리는 네 값**을
 * 다 확인한다.
 *
 * 하나만 보면 안 되는 이유: `accepted_count` 는 컬럼이 아니라 계산 함수다. 이름이 바뀌거나
 * 없어지면 PostgREST 는 임베드에서 그 키만 빼고 돌려주고, 그러면 `memberCount: undefined`
 * 가 `number` 자리를 통과해 화면이 「멤버 (빈칸)명」을 그린다 — 판별 유니온이 막으려던
 * 그것이 그대로 난다.
 *
 * 모양이 어긋나면 **던진다.** "안 보인다"로 떨어뜨리면 고장을 「지워진 스터디」로 그리게 된다.
 */
function toChatStudy(
  studyId: string,
  embed: { id: string; title: string; category_id: string; accepted_count: number } | null,
): ChatStudy {
  if (embed === null || embed === undefined) return { available: false, id: studyId };

  const ok =
    typeof embed === "object" &&
    typeof embed.id === "string" &&
    typeof embed.title === "string" &&
    typeof embed.category_id === "string" &&
    typeof embed.accepted_count === "number";
  if (!ok) {
    throw new Error(
      `스터디 임베드의 모양이 다르다(방 ${studyId}): ${JSON.stringify(embed)} — ` +
        "계산 컬럼 이름이 바뀌었는지 본다",
    );
  }

  return {
    available: true,
    id: embed.id,
    title: embed.title,
    categoryId: embed.category_id,
    memberCount: embed.accepted_count,
  };
}

export type ChatMessage = {
  readonly id: string;
  readonly senderId: string | null;
  readonly senderName: string;
  readonly content: string;
  readonly createdAt: string;
};

/**
 * 내가 들어가 있는 채팅방들.
 *
 * **내 참여 행으로 걸러야 한다.** 접근 정책(`chatpart_read_member`)은 "내가 속한 방의
 * 참여자 행"을 전부 보여주므로, 안 거르면 멤버 4명짜리 방 하나가 **네 번** 나온다.
 * 게다가 `last_read_at` 이 남의 것으로 읽혀 안 읽은 수까지 틀린다.
 * (2026-09-05: 화면에서 같은 방이 네 장 뜨는 것으로 실제로 드러났다)
 */
export async function readMyChats(userId: string): Promise<readonly ChatRoom[]> {
  const supabase = await createServerSupabase();

  // **스터디 쪽은 `!inner` 가 아니다.** `studies_read` 는 지워진 스터디를 호스트에게만
  // 보여주므로, inner 조인이면 멤버에게서 방이 통째로 떨어진다 — 목록에서 사라지고
  // 주소로 들어가도 404 다. 승인된 스펙(INV-Z6 · S5)은 정확히 반대를 계약으로 삼는다:
  // "멤버들의 참여 기록과 대화는 그대로 남는다". 데이터베이스는 지키는데 이 질의가 깼었다.
  // 스터디 id 는 방 자체에 있으므로(chats.study_id) 스터디를 못 읽어도 방은 온전하다.
  const { data, error } = await myChatsQuery(supabase, userId);

  if (error) throw new Error(`채팅방 목록을 읽지 못했다: ${error.message}`);

  const rows = (data ?? []) as unknown as {
    last_read_at: string | null;
    chat: {
      id: string;
      study_id: string;
      study: { id: string; title: string; category_id: string; accepted_count: number } | null;
    };
  }[];

  // 방마다 마지막 메시지와 안 읽은 수를 센다. 방 수가 사람당 몇 개라 이대로 두고,
  // 목록이 길어지면 데이터베이스 쪽 뷰로 옮긴다.
  const rooms = await Promise.all(
    rows.map(async (row) => {
      const { data: last } = await supabase
        .from("chat_messages")
        .select("content, created_at")
        .eq("chat_id", row.chat.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // 마지막으로 읽은 시각이 있으면 그 뒤만 센다. 없으면(한 번도 안 열어 본 방) 전부다.
      let counter = supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("chat_id", row.chat.id);
      if (row.last_read_at) counter = counter.gt("created_at", row.last_read_at);
      const { count } = await counter;
      const unread = count ?? 0;
      return {
        id: row.chat.id,
        study: toChatStudy(row.chat.study_id, row.chat.study),
        lastMessage: (last?.content as string | undefined) ?? null,
        lastMessageAt: (last?.created_at as string | undefined) ?? null,
        unread,
      };
    }),
  );

  return rooms.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
}

export type ChatRoomPage = {
  readonly id: string;
  readonly study: ChatStudy;
  readonly messages: readonly ChatMessage[];
};

/** 방 하나와 최근 메시지. 멤버가 아니면 null 이다(접근 정책이 방부터 안 보여준다) */
export async function readChatRoom(chatId: string, limit = 100): Promise<ChatRoomPage | null> {
  const supabase = await createServerSupabase();

  // 목록과 같은 이유로 스터디는 바깥 조인이다 — 스터디가 지워져도 방은 열려야 한다(INV-Z6).
  const { data: chat, error } = await chatRoomQuery(supabase, chatId);

  if (error) throw new Error(`채팅방을 읽지 못했다: ${error.message}`);
  if (!chat) return null;

  const room = chat as unknown as {
    id: string;
    study_id: string;
    study: { id: string; title: string; category_id: string; accepted_count: number } | null;
  };

  const { data: rows } = await supabase
    .from("chat_messages")
    .select("id, sender_id, content, created_at, sender:profiles(username)")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(limit);

  const messages = ((rows ?? []) as unknown as {
    id: string;
    sender_id: string | null;
    content: string;
    created_at: string;
    sender: { username: string } | null;
  }[])
    .map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      senderName: m.sender?.username ?? "나간 멤버",
      content: m.content,
      createdAt: m.created_at,
    }))
    .reverse(); // 최근 것부터 받아 와서 화면 순서(오래된 것 → 최근)로 뒤집는다

  return {
    id: room.id,
    study: toChatStudy(room.study_id, room.study),
    messages,
  };
}
