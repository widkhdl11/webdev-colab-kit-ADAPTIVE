"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { ChatMessage } from "@/entities/chat";
import { browserSupabase } from "@/shared/api/supabase/browser-client";
import { Button } from "@/shared/ui/button/Button";
import { hourMinute } from "@/shared/lib/schedule";
import type { ActionResult } from "@/shared/lib/action-result";
import { sendMessageAction } from "../api/chat-actions";
import styles from "./chat-room.module.css";

/** "2026-09-05T21:03:11Z" → "21:03" */
function timeOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return hourMinute(
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
  );
}

function dayOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/**
 * 그룹 채팅. 서버가 그려 준 메시지 위에 실시간으로 새 것을 얹는다.
 *
 * **실시간이 끊겨도 대화는 보인다** — 첫 화면은 서버가 이미 그렸고, 구독은 그 위에
 * 덧붙이는 것이라서다. 반대로 만들면(빈 화면 + 구독) 연결이 안 될 때 방이 통째로 빈다.
 */
export function ChatRoomView({
  chatId,
  myId,
  initialMessages,
}: {
  chatId: string;
  myId: string;
  initialMessages: readonly ChatMessage[];
}) {
  const [messages, setMessages] = useState<readonly ChatMessage[]>(initialMessages);
  const [live, setLive] = useState<"연결 중" | "실시간" | "끊김">("연결 중");
  const [result, submit, pending] = useActionState<ActionResult<null> | null, FormData>(
    sendMessageAction,
    null,
  );
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  // 서버가 다시 그려 준 목록이 오면 그것이 정본이다.
  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let supabase: ReturnType<typeof browserSupabase>;

    try {
      supabase = browserSupabase();
    } catch {
      setLive("끊김");
      return;
    }

    // 참가 응답이 아예 안 오는 경우가 있다. 말없이 기다리는 대신 사실대로 말한다 —
    // 첫 화면은 서버가 이미 그렸으므로 대화가 안 보이는 것은 아니다.
    const giveUp = setTimeout(() => {
      setLive((now) => (now === "연결 중" ? "끊김" : now));
    }, 8000);

    async function connect() {
      // **토큰을 먼저 실은 뒤에 참가해야 한다.** 방송도 행 수준 접근 정책으로 판정되는데,
      // 그 판정에 쓰이는 신원은 **참가하는 순간** 정해진다. 참가부터 하고 나중에 토큰을
      // 실으면 채널은 "연결됨"이라고 답하면서 **메시지는 하나도 안 온다** — 오류도 안 나서
      // 화면만 보고는 멀쩡해 보인다.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
      if (cancelled) return;

      // 방마다 주제 하나(`chat:<방 id>`). 데이터베이스의 트리거가 그 주제로 쏘고,
      // 누가 들을 수 있는지는 `realtime.messages` 의 접근 정책이 정한다(0006).
      // private 로 여는 이유가 그것이다 — 공개 주제는 정책 판정을 안 탄다.
      channel = supabase
        .channel(`chat:${chatId}`, { config: { private: true } })
        .on(
          "broadcast",
          { event: "new_message" },
          (message) => {
            const row = (message.payload as { record?: Record<string, unknown> }).record as
              | {
                  id: string;
                  sender_id: string | null;
                  content: string;
                  created_at: string;
                }
              | undefined;
            if (!row) return;
            setMessages((prev) =>
              // 서버가 이미 그린 것과 겹칠 수 있다 — 같은 id 는 한 번만 둔다.
              prev.some((m) => m.id === row.id)
                ? prev
                : [
                    ...prev,
                    {
                      id: row.id,
                      senderId: row.sender_id,
                      // 실시간 알림에는 보낸 사람 이름이 없다. 새로고침하면 채워진다.
                      senderName: row.sender_id === myId ? "나" : "멤버",
                      content: row.content,
                      createdAt: row.created_at,
                    },
                  ],
            );
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            clearTimeout(giveUp);
            setLive("실시간");
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            clearTimeout(giveUp);
            setLive("끊김");
          }
        });
    }

    void connect();

    return () => {
      cancelled = true;
      clearTimeout(giveUp);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [chatId, myId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    if (result?.ok) formRef.current?.reset();
  }, [result]);

  let lastDay = "";

  return (
    <section className={styles.room} aria-label="대화">
      <p className={styles.live} data-state={live}>
        {live === "실시간"
          ? "새 메시지가 바로 옵니다"
          : live === "연결 중"
            ? "실시간 연결을 여는 중…"
            : "실시간 연결이 끊겼습니다. 새로고침하면 최신 대화가 보입니다"}
      </p>

      <ol className={styles.list}>
        {messages.length === 0 ? (
          <li className={styles.empty}>아직 대화가 없습니다. 첫 인사를 남겨 보세요.</li>
        ) : null}

        {messages.map((m) => {
          const day = dayOf(m.createdAt);
          const showDay = day !== lastDay;
          lastDay = day;
          const mine = m.senderId === myId;

          return (
            <li key={m.id}>
              {showDay ? <p className={styles.day}>{day}</p> : null}
              <div className={mine ? `${styles.bubbleRow} ${styles.mine}` : styles.bubbleRow}>
                <div className={styles.bubble}>
                  {!mine ? <p className={styles.sender}>{m.senderName}</p> : null}
                  <p className={styles.text}>{m.content}</p>
                </div>
                <time className={styles.time} dateTime={m.createdAt}>
                  {timeOf(m.createdAt)}
                </time>
              </div>
            </li>
          );
        })}
        <div ref={bottomRef} />
      </ol>

      <form action={submit} className={styles.composer} ref={formRef}>
        <input type="hidden" name="chatId" value={chatId} />
        <label className="sr-only" htmlFor="content">
          보낼 메시지
        </label>
        <input
          id="content"
          name="content"
          type="text"
          maxLength={2000}
          required
          autoComplete="off"
          placeholder="메시지를 입력하세요"
          className={styles.input}
        />
        <Button tone="ink" type="submit" disabled={pending}>
          {pending ? "보내는 중…" : "보내기"}
        </Button>
      </form>

      {result && !result.ok ? (
        <p className={styles.error} role="alert">
          {result.message}
        </p>
      ) : null}
    </section>
  );
}
