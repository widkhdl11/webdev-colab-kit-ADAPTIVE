import { createServerSupabase } from "@/shared/api/supabase/server-client";

export type ChatRoom = {
  readonly id: string;
  readonly studyId: string;
  readonly studyTitle: string;
  readonly categoryId: string;
  readonly memberCount: number;
  readonly lastMessage: string | null;
  readonly lastMessageAt: string | null;
  /** 마지막으로 읽은 시각 뒤에 온 메시지 수. 저장하지 않고 센다 */
  readonly unread: number;
};

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

  const { data, error } = await supabase
    .from("chat_participants")
    .select(
      `last_read_at,
       chat:chats!inner(
         id,
         study:studies!inner(id, title, category_id, accepted_count)
       )`,
    )
    .eq("user_id", userId);

  if (error) throw new Error(`채팅방 목록을 읽지 못했다: ${error.message}`);

  const rows = (data ?? []) as unknown as {
    last_read_at: string | null;
    chat: {
      id: string;
      study: { id: string; title: string; category_id: string; accepted_count: number };
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

      let unread = 0;
      if (row.last_read_at) {
        const { count } = await supabase
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("chat_id", row.chat.id)
          .gt("created_at", row.last_read_at);
        unread = count ?? 0;
      } else {
        const { count } = await supabase
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("chat_id", row.chat.id);
        unread = count ?? 0;
      }

      return {
        id: row.chat.id,
        studyId: row.chat.study.id,
        studyTitle: row.chat.study.title,
        categoryId: row.chat.study.category_id,
        memberCount: row.chat.study.accepted_count,
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
  readonly studyId: string;
  readonly studyTitle: string;
  readonly categoryId: string;
  readonly memberCount: number;
  readonly messages: readonly ChatMessage[];
};

/** 방 하나와 최근 메시지. 멤버가 아니면 null 이다(접근 정책이 방부터 안 보여준다) */
export async function readChatRoom(chatId: string, limit = 100): Promise<ChatRoomPage | null> {
  const supabase = await createServerSupabase();

  const { data: chat, error } = await supabase
    .from("chats")
    .select("id, study:studies!inner(id, title, category_id, accepted_count)")
    .eq("id", chatId)
    .maybeSingle();

  if (error) throw new Error(`채팅방을 읽지 못했다: ${error.message}`);
  if (!chat) return null;

  const room = chat as unknown as {
    id: string;
    study: { id: string; title: string; category_id: string; accepted_count: number };
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
    studyId: room.study.id,
    studyTitle: room.study.title,
    categoryId: room.study.category_id,
    memberCount: room.study.accepted_count,
    messages,
  };
}
