// 근거 스펙: docs/specs/write-authorization.md (INV-Z1 ~ INV-Z11)
//
// **여기서 쓰는 연결은 전부 공개 키다.** 그 키는 브라우저 번들에도 들어가는 값이라,
// 이 연결로 할 수 있는 일이 곧 "아무나 할 수 있는 일"이다. 서버 코드를 한 줄도 거치지
// 않고 데이터베이스를 직접 부르는 것이 정확히 INV-Z5 가 말하는 우회 경로다.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chatRoomQuery, myChatsQuery } from "@/entities/chat/api/chat-select";
import {
  API_URL,
  PUBLISHABLE,
  admin,
  anonClient,
  acceptedMember,
  apply,
  chatIdOf,
  createStudy,
  createUser,
  cleanupCreatedUsers,
  rawClient,
  type TestUser,
} from "./helpers";

let host: TestUser;
let stranger: TestUser;
let member: TestUser;
let studyId: string;
let postId: string;

beforeAll(async () => {
  host = await createUser("z-host");
  stranger = await createUser("z-stranger");
  member = await createUser("z-member");

  studyId = await createStudy(host.id, { max_participants: 5 });
  await admin.from("participants").insert({ study_id: studyId, user_id: member.id });
  await admin
    .from("participants")
    .update({ status: "accepted" })
    .eq("study_id", studyId)
    .eq("user_id", member.id);

  const { data } = await admin
    .from("posts")
    .insert({ author_id: host.id, study_id: studyId, title: "모집", content: "본문" })
    .select("id")
    .single();
  postId = data!.id as string;
}, 60_000);

afterAll(async () => {
  await cleanupCreatedUsers();
});

describe("INV-Z5: 애플리케이션을 우회한 직접 접근에도 인가가 유지된다", () => {
  it("INV-Z5: 모든 공개 테이블에 행 수준 접근 정책이 켜져 있다", async () => {
    const c = await rawClient();
    try {
      const { rows } = await c.query(
        `select relname, relrowsecurity from pg_class
          where relnamespace = 'public'::regnamespace and relkind = 'r'`,
      );
      const off = rows.filter((r) => !r.relrowsecurity).map((r) => r.relname as string);
      expect(off).toEqual([]);
      expect(rows.length).toBeGreaterThan(8); // 테이블이 실제로 있는 상태에서 잰 것임을 보인다
    } finally {
      await c.end();
    }
  });

  it("INV-Z5: 쓰기 정책 중 조건이 '아무나'인 것이 하나도 없다", async () => {
    // 이 검사가 필요한 이유: 위/아래의 행동 검사들은 "요청이 거부됐다"만 본다. 그런데
    // 거부는 정책 말고 다른 이유로도 일어날 수 있어서, **정책을 활짝 열어도 행동 검사가
    // 전부 초록불인 상태**가 실제로 나왔다(2026-09-05, studies_update_host 를 true 로
    // 바꾸는 변이). 그래서 정책 표현식 자체를 직접 붙든다.
    const c = await rawClient();
    try {
      const { rows } = await c.query(
        `select n.nspname || '.' || cl.relname as tbl, p.polname,
                p.polcmd, p.polpermissive,
                coalesce(pg_get_expr(p.polqual, p.polrelid), 'null')      as using_expr,
                coalesce(pg_get_expr(p.polwithcheck, p.polrelid), 'null') as check_expr
           from pg_policy p
           join pg_class cl on cl.oid = p.polrelid
           join pg_namespace n on n.oid = cl.relnamespace
          where n.nspname in ('public', 'storage')`,
      );
      const writes = rows.filter((r) => ["a", "w", "d", "*"].includes(r.polcmd as string));
      expect(writes.length).toBeGreaterThan(8); // 검사할 대상이 실제로 있다

      const open = writes.filter((r) => {
        const parts = [r.using_expr, r.check_expr].filter((e) => e !== "null") as string[];
        // 조건이 전혀 없거나, 남은 조건이 전부 상수 true 면 "아무나"다.
        if (parts.length === 0) return true;
        return parts.every((e) => /^\(?\s*true\s*\)?$/i.test(e.trim()));
      });
      expect(open.map((r) => `${r.tbl}.${r.polname}`)).toEqual([]);
    } finally {
      await c.end();
    }
  });

  it("INV-Z5: 스터디를 고치는 정책은 호스트 본인만 가리킨다", async () => {
    const c = await rawClient();
    try {
      const { rows } = await c.query(
        `select coalesce(pg_get_expr(polqual, polrelid),'') as u,
                coalesce(pg_get_expr(polwithcheck, polrelid),'') as w
           from pg_policy where polrelid='public.studies'::regclass and polcmd='w'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].u).toContain("host_id");
      expect(rows[0].u).toContain("auth.uid()");
      expect(rows[0].w).toContain("host_id");
    } finally {
      await c.end();
    }
  });

  it("INV-Z5(실패경로 S3): 로그인한 남이 공개 키로 남의 스터디를 지우려 하면 아무것도 안 지워진다", async () => {
    const { error } = await stranger.client.from("studies").delete().eq("id", studyId);
    // 정책이 없는 동작은 "허용된 행이 0건"으로 나타난다 — 오류가 아니라 아무 일도 안 일어난다.
    expect(error).toBeNull();

    const { data } = await admin.from("studies").select("id").eq("id", studyId).maybeSingle();
    expect(data).not.toBeNull(); // 여전히 살아 있다
  });

  it("INV-Z5(실패경로): 로그인조차 안 한 공개 키로 스터디를 만들 수 없다", async () => {
    const { error } = await anonClient()
      .from("studies")
      .insert({
        host_id: stranger.id,
        title: "몰래",
        description: "본문",
        category_id: "it",
        region: "온라인",
        max_participants: 3,
      });
    expect(error).not.toBeNull();
  });

  it("INV-Z5(반대 절반 S4): 호스트 자신은 같은 방법으로 자기 스터디를 고칠 수 있다", async () => {
    const { error } = await host.client
      .from("studies")
      .update({ title: "호스트가 고친 제목" })
      .eq("id", studyId);
    expect(error).toBeNull();

    const { data } = await admin.from("studies").select("title").eq("id", studyId).single();
    expect(data!.title).toBe("호스트가 고친 제목");
  });
});

describe("INV-Z1: 스터디를 지우는 것은 호스트만", () => {
  it("INV-Z1(실패경로 S1): 호스트가 아닌 사람의 삭제 표시는 반영되지 않는다", async () => {
    await stranger.client
      .from("studies")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", studyId);

    const { data } = await admin.from("studies").select("deleted_at").eq("id", studyId).single();
    expect(data!.deleted_at).toBeNull();
  });
});

describe("INV-Z2: 신청을 수락·거절·강퇴하는 것은 호스트만", () => {
  it("INV-Z2(실패경로 S2): 남이 대기 중인 신청을 수락해도 상태가 안 바뀐다", async () => {
    const applicantStudy = await createStudy(host.id, { max_participants: 5 });
    await admin.from("participants").insert({ study_id: applicantStudy, user_id: stranger.id });

    await member.client
      .from("participants")
      .update({ status: "accepted" })
      .eq("study_id", applicantStudy)
      .eq("user_id", stranger.id);

    const { data } = await admin
      .from("participants")
      .select("status")
      .eq("study_id", applicantStudy)
      .eq("user_id", stranger.id)
      .single();
    expect(data!.status).toBe("pending");
  });

  it("INV-Z2(실패경로): 대기 중인 신청자가 자기 신청을 스스로 수락할 수 없다", async () => {
    // 위 S2 와 다른 경로다. 저기서는 **남의 행**이라 `participants_update_self` 의 using 이
    // 먼저 막는다. 여기서는 자기 행이라 using 을 지나가고, 남는 강제 위치는 그 정책의
    // with check 에 있는 `status = 'withdrawn'` 하나뿐이다 — 그 조건만 빼면
    // 신청자가 호스트 승인 없이 스스로 멤버가 된다.
    const s = await createStudy(host.id, { max_participants: 5 });
    await admin.from("participants").insert({ study_id: s, user_id: stranger.id });

    const { error } = await stranger.client
      .from("participants")
      .update({ status: "accepted" })
      .eq("study_id", s)
      .eq("user_id", stranger.id);

    // **무엇이 막았는지**까지 본다. 「안 바뀌었다」도 정책 말고 다른 이유로 일어난다 —
    // 0002 의 `grant update (status)` 를 되돌리면 열 권한이 대신 막고, 결과만 보는
    // 단언은 그대로 초록불이다. 둘 다 42501 이라 코드로는 못 가른다.
    expect(error).not.toBeNull();
    expect(error!.message).toContain("row-level security");

    const { data } = await admin
      .from("participants")
      .select("status")
      .eq("study_id", s)
      .eq("user_id", stranger.id)
      .single();
    expect(data!.status).toBe("pending");

    // 채팅방에도 안 들어갔다. 수락을 보고 트리거가 넣기 때문에, 여기까지 봐야
    // "멤버가 되지 않았다"가 된다 — 상태 한 칸만 보면 트리거 쪽 경로가 안 보인다.
    const chatId = await chatIdOf(s);
    const { data: joined } = await admin
      .from("chat_participants")
      .select("user_id")
      .eq("chat_id", chatId)
      .eq("user_id", stranger.id);
    expect(joined).toHaveLength(0);
  });

  it("INV-Z2(반대 절반): 호스트는 수락할 수 있다", async () => {
    const s = await createStudy(host.id, { max_participants: 5 });
    await admin.from("participants").insert({ study_id: s, user_id: stranger.id });

    const { error } = await host.client
      .from("participants")
      .update({ status: "accepted" })
      .eq("study_id", s)
      .eq("user_id", stranger.id);
    expect(error).toBeNull();

    const { data } = await admin
      .from("participants")
      .select("status")
      .eq("study_id", s)
      .eq("user_id", stranger.id)
      .single();
    expect(data!.status).toBe("accepted");
  });

  it("INV-Z2: 본인의 탈퇴는 본인이 할 수 있다 — 호스트만 막는 것이 아니다", async () => {
    const s = await createStudy(host.id, { max_participants: 5 });
    await admin.from("participants").insert({ study_id: s, user_id: member.id });
    await admin
      .from("participants")
      .update({ status: "accepted" })
      .eq("study_id", s)
      .eq("user_id", member.id);

    const { error } = await member.client
      .from("participants")
      .update({ status: "withdrawn" })
      .eq("study_id", s)
      .eq("user_id", member.id);
    expect(error).toBeNull();

    // 결과를 다시 읽는다. 정책을 통째로 지우면 using 이 걸러 **0행이 갱신되고**
    // PostgREST 는 오류를 안 낸다 — 「error 가 null 이다」만 보면 그 상태가 초록불이다.
    const { data } = await admin
      .from("participants")
      .select("status")
      .eq("study_id", s)
      .eq("user_id", member.id)
      .single();
    expect(data!.status).toBe("withdrawn");
  });
});

describe("INV-Z3: 모집글을 고치거나 지우는 것은 작성자만", () => {
  it("INV-Z3(실패경로): 남이 고쳐도 내용이 안 바뀐다", async () => {
    await stranger.client.from("posts").update({ title: "가로챈 제목" }).eq("id", postId);
    const { data } = await admin.from("posts").select("title").eq("id", postId).single();
    expect(data!.title).toBe("모집");
  });

  it("INV-Z3(실패경로): 남이 지워도 글이 남는다", async () => {
    await stranger.client.from("posts").delete().eq("id", postId);
    const { data } = await admin.from("posts").select("id").eq("id", postId).maybeSingle();
    expect(data).not.toBeNull();
  });

  it("INV-Z3(반대 절반): 작성자는 고칠 수 있다", async () => {
    const { error } = await host.client
      .from("posts")
      .update({ title: "작성자가 고침" })
      .eq("id", postId);
    expect(error).toBeNull();
  });
});

describe("INV-Z4: 인가 판정의 근거는 데이터베이스가 아는 현재 사용자다", () => {
  it("INV-Z4(실패경로): 남의 id 를 host_id 에 적어 스터디를 만들 수 없다", async () => {
    const { error } = await stranger.client.from("studies").insert({
      host_id: host.id, // 요청 본문이 들고 온 값. 이것을 믿으면 안 된다.
      title: "남의 이름으로",
      description: "본문",
      category_id: "it",
      region: "온라인",
      max_participants: 3,
    });
    expect(error).not.toBeNull();
  });

  it("INV-Z4(실패경로): 남의 id 로 신청 행을 만들 수 없다", async () => {
    const s = await createStudy(host.id, { max_participants: 5 });
    const { error } = await stranger.client
      .from("participants")
      .insert({ study_id: s, user_id: member.id }); // 남을 대신해 신청
    expect(error).not.toBeNull();
  });

  it("INV-Z4(실패경로): 자기 신청이어도 수락 상태로는 넣을 수 없다", async () => {
    const s = await createStudy(host.id, { max_participants: 5 });
    const { error } = await stranger.client
      .from("participants")
      .insert({ study_id: s, user_id: stranger.id, status: "accepted" });
    expect(error).not.toBeNull();
  });
});

describe("INV-Z6: 사람이 남긴 것이 딸린 스터디는 지워도 사라지지 않는다", () => {
  it("INV-Z6: 스터디 행을 직접 지우는 것은 호스트에게도 허용되지 않는다", async () => {
    const s = await createStudy(host.id, { max_participants: 5 });
    const { error } = await host.client.from("studies").delete().eq("id", s);
    expect(error).toBeNull(); // 정책이 없어 허용된 행이 0건 — 오류가 아니라 무효다

    const { data } = await admin.from("studies").select("id").eq("id", s).maybeSingle();
    expect(data).not.toBeNull();
  });

  it("INV-Z6(S5): 호스트가 삭제 표시를 하면 목록에서 사라지지만 멤버의 기록과 대화는 남는다", async () => {
    const s = await createStudy(host.id, { max_participants: 5 });
    await admin.from("participants").insert({ study_id: s, user_id: member.id });
    await admin
      .from("participants")
      .update({ status: "accepted" })
      .eq("study_id", s)
      .eq("user_id", member.id);
    const { data: chat } = await admin.from("chats").select("id").eq("study_id", s).single();
    await admin
      .from("chat_messages")
      .insert({ chat_id: chat!.id, sender_id: member.id, content: "첫 모임 언제 할까요" });

    await host.client.from("studies").update({ deleted_at: new Date().toISOString() }).eq("id", s);

    // 남에게는 안 보인다
    const { data: seenByStranger } = await stranger.client
      .from("studies")
      .select("id")
      .eq("id", s)
      .maybeSingle();
    expect(seenByStranger).toBeNull();

    // 멤버의 참여 기록과 메시지는 그대로다
    const { data: part } = await admin
      .from("participants")
      .select("status")
      .eq("study_id", s)
      .eq("user_id", member.id)
      .single();
    expect(part!.status).toBe("accepted");

    const { data: msgs } = await member.client.from("chat_messages").select("content").eq("chat_id", chat!.id);
    expect(msgs?.map((m) => m.content)).toContain("첫 모임 언제 할까요");
  });
});

describe("INV-Z7: 파일 저장소의 삭제·수정은 올린 사람만", () => {
  it("INV-Z7: 저장소에 '누구나 삭제'인 정책이 없다", async () => {
    const c = await rawClient();
    try {
      const { rows } = await c.query(
        `select polname, pg_get_expr(polqual, polrelid) as qual, polcmd
           from pg_policy
          where polrelid = 'storage.objects'::regclass`,
      );
      const deletePolicies = rows.filter((r) => r.polcmd === "d");
      expect(deletePolicies.length).toBeGreaterThan(0); // 검사할 대상이 실제로 있다
      for (const p of deletePolicies) {
        expect(String(p.qual)).toContain("auth.uid()"); // 조건이 true 인 정책이 없다
      }
    } finally {
      await c.end();
    }
  });

  it("INV-Z7(실패경로 S6): 남이 올린 파일을 지울 수 없다", async () => {
    const path = `${host.id}/avatar.txt`;
    const up = await host.client.storage
      .from("avatars")
      .upload(path, new Blob(["hi"]), { upsert: true });
    expect(up.error).toBeNull();

    await stranger.client.storage.from("avatars").remove([path]);

    const { data } = await admin.storage.from("avatars").list(host.id);
    expect(data?.map((f) => f.name)).toContain("avatar.txt");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2026-09-05 (2) 리뷰 개정 — INV-Z8 · INV-Z9 · INV-Z10
//
// 이 블록이 잡는 것은 앞의 검사들이 구조적으로 못 잡는 종류다. 앞의 표현식 검사는
// "조건이 통째로 사라진 정책"을 잡지만, **조건은 있는데 지켜야 할 열을 안 붙드는 정책**은
// 그대로 통과시킨다. 아래 셋이 정확히 그 자리다.
// ─────────────────────────────────────────────────────────────────────────────

describe("INV-Z8: 소유·소속을 나타내는 열은 갱신으로 바뀌지 않는다", () => {
  it("INV-Z8 (S7): 호스트가 자기 참여 행의 user_id 를 남으로 바꿀 수 없다", async () => {
    // 이것이 왜 위험한가: participants_update_host 의 조건은 study_id 만 본다. user_id 가
    // 요청이 보낸 값 그대로 들어가면, 호스트 판정을 **통과한 채로 판정의 대상이 바뀐다** —
    // 신청한 적 없는 사람이 멤버가 되고 트리거가 이어서 채팅방에 넣는다.
    const victim = await createUser("z8-victim");

    const s = await createStudy(host.id, { max_participants: 5 });
    const { data: own } = await admin
      .from("participants")
      .select("id")
      .eq("study_id", s)
      .eq("user_id", host.id)
      .single();

    const { error } = await host.client
      .from("participants")
      .update({ user_id: victim.id })
      .eq("id", own!.id as string);

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501"); // 정책이 아니라 열 권한이 막는다

    // 거부만 보지 않는다 — 실제로 안 바뀌었는지 다시 읽는다
    const { data: after } = await admin
      .from("participants")
      .select("user_id")
      .eq("id", own!.id as string)
      .single();
    expect(after!.user_id).toBe(host.id);

    // 피해자는 이 스터디의 채팅방에도 없다
    const chatId = await chatIdOf(s);
    const { data: inChat } = await admin
      .from("chat_participants")
      .select("id")
      .eq("chat_id", chatId)
      .eq("user_id", victim.id);
    expect(inChat).toHaveLength(0);
  });

  it("INV-Z8 (S8): 멤버가 자기 채팅 참여 행의 chat_id 를 남의 방으로 바꿀 수 없다", async () => {
    const other = await createStudy(stranger.id, { max_participants: 5 });
    const otherChat = await chatIdOf(other);

    // 남의 방에 메시지를 하나 남겨 둔다 — 옮겨 갔다면 이게 보였을 것이다
    await admin.from("chat_messages").insert({
      chat_id: otherChat,
      sender_id: stranger.id,
      content: "남의 방 대화",
    });

    const myChat = await chatIdOf(studyId);
    const { data: mine } = await admin
      .from("chat_participants")
      .select("id")
      .eq("chat_id", myChat)
      .eq("user_id", member.id)
      .single();

    const { error } = await member.client
      .from("chat_participants")
      .update({ chat_id: otherChat })
      .eq("id", mine!.id as string);

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");

    const { data: after } = await admin
      .from("chat_participants")
      .select("chat_id")
      .eq("id", mine!.id as string)
      .single();
    expect(after!.chat_id).toBe(myChat);

    // 그리고 남의 방 대화는 여전히 안 보인다
    const { data: msgs } = await member.client
      .from("chat_messages")
      .select("id")
      .eq("chat_id", otherChat);
    expect(msgs).toHaveLength(0);
  });

  it("INV-Z8 (S9, 반대 절반): 마지막으로 읽은 시각은 본인이 갱신할 수 있다", async () => {
    // 열 권한이 갱신을 통째로 막아 버려서 위 둘이 통과한 것이 아님을 보인다.
    const myChat = await chatIdOf(studyId);
    const stamp = new Date().toISOString();

    const { error } = await member.client
      .from("chat_participants")
      .update({ last_read_at: stamp })
      .eq("chat_id", myChat)
      .eq("user_id", member.id);

    expect(error).toBeNull();

    const { data: after } = await admin
      .from("chat_participants")
      .select("last_read_at")
      .eq("chat_id", myChat)
      .eq("user_id", member.id)
      .single();
    expect(after!.last_read_at).not.toBeNull();
  });
});

describe("INV-Z9: 모집글을 만들 수 있는 것은 그 스터디의 호스트뿐이다", () => {
  it("INV-Z9 (S10, 실패경로): 호스트가 아닌 사람이 남의 스터디에 모집글을 붙일 수 없다", async () => {
    const { error } = await stranger.client
      .from("posts")
      .insert({ author_id: stranger.id, study_id: studyId, title: "가로채기", content: "본문" });

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");

    const { data: posts } = await admin.from("posts").select("id").eq("author_id", stranger.id);
    expect(posts).toHaveLength(0);
  });

  it("INV-Z9 (반대 절반): 호스트는 자기 스터디에 모집글을 쓸 수 있다", async () => {
    const s = await createStudy(host.id);
    const { data, error } = await host.client
      .from("posts")
      .insert({ author_id: host.id, study_id: s, title: "2기 모집", content: "본문" })
      .select("id")
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
  });

  it("INV-Z9 (INV-Z8 과 함께): 이미 쓴 모집글을 남의 스터디로 옮길 수 없다", async () => {
    const other = await createStudy(stranger.id);
    const { error } = await host.client
      .from("posts")
      .update({ study_id: other })
      .eq("id", postId);

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");

    const { data: after } = await admin.from("posts").select("study_id").eq("id", postId).single();
    expect(after!.study_id).toBe(studyId);
  });
});

describe("INV-Z10: 지워진 것으로 표시된 스터디는 새로운 쓰기를 받지 않는다", () => {
  it("INV-Z10 (S11): 지워진 스터디의 대기 신청은 수락되지 않는다", async () => {
    const s = await createStudy(host.id, { max_participants: 5 });
    const applicant = await createUser("z10-applicant");
    await apply(s, applicant.id);

    await admin.from("studies").update({ deleted_at: new Date().toISOString() }).eq("id", s);

    const { error } = await host.client
      .from("participants")
      .update({ status: "accepted" })
      .eq("study_id", s)
      .eq("user_id", applicant.id);

    expect(error).not.toBeNull();

    const { data: after } = await admin
      .from("participants")
      .select("status")
      .eq("study_id", s)
      .eq("user_id", applicant.id)
      .single();
    expect(after!.status).toBe("pending");
  });

  it("INV-Z10: 지워진 스터디에는 새 신청도 들어가지 않는다", async () => {
    const s = await createStudy(host.id, { max_participants: 5 });
    await admin.from("studies").update({ deleted_at: new Date().toISOString() }).eq("id", s);

    const { error } = await stranger.client
      .from("participants")
      .insert({ study_id: s, user_id: stranger.id });

    expect(error).not.toBeNull();
  });

  it("INV-Z10: 지워진 스터디의 모집글은 목록에 나오지 않는다 — 호스트에게는 보인다", async () => {
    const s = await createStudy(host.id);
    const { data: p } = await admin
      .from("posts")
      .insert({ author_id: host.id, study_id: s, title: "곧 지워질 스터디", content: "본문" })
      .select("id")
      .single();

    // 지우기 전에는 지나가던 사람에게도 보인다 (검사할 대상이 실제로 있다)
    const before = await anonClient().from("posts").select("id").eq("id", p!.id as string);
    expect(before.data).toHaveLength(1);

    await admin.from("studies").update({ deleted_at: new Date().toISOString() }).eq("id", s);

    const after = await anonClient().from("posts").select("id").eq("id", p!.id as string);
    expect(after.data).toHaveLength(0);

    // 호스트는 자기 것을 지워진 뒤에도 본다 — INV-Z6 과 같은 결
    const mine = await host.client.from("posts").select("id").eq("id", p!.id as string);
    expect(mine.data).toHaveLength(1);
  });
});

describe("INV-Z6 (S5): 스터디를 지워도 멤버의 대화는 화면에서 사라지지 않는다", () => {
  // 여기서 검사하는 것은 정책이 아니라 **화면이 보내는 질의**다. 정책은 계약을 지키고
  // 있었는데(방·메시지 그대로), 목록 질의가 `study:studies!inner(...)` 로 조인해서 지워진
  // 스터디의 방을 멤버에게서 떨어뜨렸다 — 방이 목록에서 사라지고 주소로도 404 였다.
  // 그래서 조회 코드가 실제로 쓰는 **질의 조각을 그대로** 부른다. 여기서 질의를 다시
  // 조립하면(select 문자열만 공유하고 필터는 다시 적으면) 이 검사는 절반만 붙든다.

  it("INV-Z6 (S5): 호스트가 지운 뒤에도 멤버의 채팅방 목록에 그 방이 남는다", async () => {
    const h = await createUser("z6-host");
    const m = await createUser("z6-member");
    const m2 = await createUser("z6-member2");

    const s = await createStudy(h.id, { max_participants: 5 });
    await acceptedMember(s, m.id);
    await acceptedMember(s, m2.id); // 스펙 S5 의 Given 은 「수락된 멤버 2명」이다
    const chatId = await chatIdOf(s);
    await admin
      .from("chat_messages")
      .insert({ chat_id: chatId, sender_id: m.id, content: "지워지기 전 대화" });

    type ListRow = {
      chat: { id: string; study_id: string; study: Record<string, unknown> | null };
    };
    const listOf = async () =>
      (await myChatsQuery(m.client, m.id)).data as unknown as ListRow[] | null;

    const before = (await listOf()) ?? [];
    // 필터가 없으면 방 하나가 멤버 수만큼 나온다 — 행 수가 그것을 붙든다.
    expect(before).toHaveLength(1);
    expect(before[0].chat.id).toBe(chatId);
    expect(before[0].chat.study).toEqual({
      id: s,
      title: "테스트 스터디",
      category_id: "it",
      accepted_count: 3,
    });

    await h.client.from("studies").update({ deleted_at: new Date().toISOString() }).eq("id", s);

    // 스터디는 정말 안 보인다 — 방이 남은 것이 「삭제가 안 먹었다」 때문이 아님을 보인다
    const gone = await m.client.from("studies").select("id").eq("id", s);
    expect(gone.data).toHaveLength(0);

    const after = (await listOf()) ?? [];
    expect(after).toHaveLength(1);
    expect(after[0].chat.id).toBe(chatId);
    expect(after[0].chat.study_id).toBe(s); // 스터디 id 는 방에 있어서 여전히 온다
    expect(after[0].chat.study).toBeNull(); // 스터디 자체는 안 보인다

    // 방 하나를 여는 질의도 같다. 객체 전체를 봐서 임베드가 통째로 빠지는 것도 잡는다 —
    // 화면은 이 embed 의 유무로 「지워졌다」를 판정한다.
    const one = await chatRoomQuery(m.client, chatId);
    expect(one.data).toEqual({ id: chatId, study_id: s, study: null });

    // 그리고 대화가 그대로 읽힌다 — 계약의 본문이 이것이다
    const msgs = await m.client.from("chat_messages").select("content").eq("chat_id", chatId);
    expect((msgs.data ?? []).map((x) => x.content)).toContain("지워지기 전 대화");
  });
});

describe("INV-Z11: 참여자 명단을 볼 수 있는 사람은 셋뿐이다", () => {
  it("INV-Z11 (S12): 수락된 멤버는 같은 스터디의 수락된 사람들을 본다 — 대기·거절은 못 본다", async () => {
    const h = await createUser("z11-host");
    const m1 = await createUser("z11-member1");
    const m2 = await createUser("z11-member2");
    const waiting = await createUser("z11-waiting");
    const refused = await createUser("z11-refused");

    const s = await createStudy(h.id, { max_participants: 8 });
    await acceptedMember(s, m1.id);
    await acceptedMember(s, m2.id);
    await apply(s, waiting.id);
    await apply(s, refused.id);
    await admin
      .from("participants")
      .update({ status: "rejected" })
      .eq("study_id", s)
      .eq("user_id", refused.id);

    const { data } = await m1.client.from("participants").select("user_id, status").eq("study_id", s);
    const seen = (data ?? []).map((r) => r.user_id as string);

    // 수락된 셋(호스트 + 멤버 둘)이 보인다
    expect(seen).toContain(h.id);
    expect(seen).toContain(m1.id);
    expect(seen).toContain(m2.id);

    // 대기 중인 사람과 거절당한 사람은 안 보인다 — "거절당했다"는 그 사람과 호스트 사이의 일이다
    expect(seen).not.toContain(waiting.id);
    expect(seen).not.toContain(refused.id);
    expect(data).toHaveLength(3);

    // 호스트는 전부 본다 (반대 절반 — 정책이 통째로 닫혀서 위가 통과한 것이 아니다)
    const asHost = await h.client.from("participants").select("user_id").eq("study_id", s);
    expect(asHost.data).toHaveLength(5);
  });

  it("INV-Z11 (S13, 실패경로): 아무 관계 없는 로그인 사용자에게는 하나도 안 보인다", async () => {
    const h = await createUser("z11-host2");
    const m = await createUser("z11-member3");

    const s = await createStudy(h.id, { max_participants: 5 });
    await acceptedMember(s, m.id);

    const { data } = await stranger.client.from("participants").select("user_id").eq("study_id", s);
    expect(data).toHaveLength(0);

    // 로그인하지 않은 연결도 마찬가지 — 수만 파생 함수로 나간다(INV-P9)
    const asAnon = await anonClient().from("participants").select("user_id").eq("study_id", s);
    expect(asAnon.data).toHaveLength(0);
  });

  it("INV-Z11: 강퇴된 사람은 남은 멤버 명단을 더는 못 본다", async () => {
    const h = await createUser("z11-host3");
    const m = await createUser("z11-kicked");
    const other = await createUser("z11-other");

    const s = await createStudy(h.id, { max_participants: 5 });
    await acceptedMember(s, m.id);
    await acceptedMember(s, other.id);

    const before = await m.client.from("participants").select("user_id").eq("study_id", s);
    expect(before.data).toHaveLength(3);

    await admin
      .from("participants")
      .update({ status: "kicked" })
      .eq("study_id", s)
      .eq("user_id", m.id);

    const after = await m.client.from("participants").select("user_id").eq("study_id", s);
    // 자기 행 하나만 남는다 — 자기가 강퇴됐다는 사실은 본인이 알아야 한다
    expect(after.data).toHaveLength(1);
    expect(after.data?.[0]?.user_id).toBe(m.id);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INV-Z12 — 인가 판정 함수는 API 표면에 없다
//
// 판정 함수들은 정책 안에서 같은 테이블을 다시 읽어도 되도록 `security definer` 로
// 만든 것이다. 즉 **정책을 지나지 않는 것이 이 함수들의 존재 이유**다. 그런 함수가
// 노출된 스키마에 있으면 PostgREST 가 통째로 RPC 로 열고, 그 문에는 정책이 없다.
//
// 2026-09-05 실측: `POST /rest/v1/rpc/is_study_member` 가 비로그인에게 200 + false 를
// 답했다. 한 명씩 물으면 INV-Z11 이 셋으로 제한한 명단이 그대로 재구성된다.
//
// **노출된 스키마는 하나가 아니다.** `supabase/config.toml` 의 `schemas` 가 둘을 연다.
// 아래 검사들은 그 둘을 다 두드린다 — 하나만 보면 다른 쪽에 만든 함수가 안 걸린다.
// ═══════════════════════════════════════════════════════════════════════════
const EXPOSED_SCHEMAS = ["public", "graphql_public"] as const;
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

describe("INV-Z12: 인가 판정 함수는 요청으로 부를 수 없다", () => {
  /**
   * 공개 키로 RPC 를 두드리고 상태 코드를 돌려준다.
   *
   * **인자를 실어 보내는 것이 중요하다.** PostgREST 는 함수가 없을 때와 본문의 키로
   * 인자를 못 맞출 때 둘 다 404(PGRST202)를 낸다. 빈 본문으로 두드리면 **노출된 함수도
   * 404 를 답한다**(2026-09-05 실측) — 그러면 이 검사는 노출을 감지하지 못하면서
   * 언제나 초록불이 된다. 실제로 그 상태로 한 번 커밋될 뻔했다.
   */
  async function callRpc(
    schema: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<number> {
    const res = await fetch(API_URL + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: {
        apikey: PUBLISHABLE,
        Authorization: "Bearer " + PUBLISHABLE,
        "Content-Type": "application/json",
        "Content-Profile": schema,
      },
      body: JSON.stringify(args),
    });
    return res.status;
  }

  /** `private` 스키마의 함수와 그 인자 이름을 데이터베이스에서 읽는다. */
  async function privateFunctions(): Promise<{ name: string; args: string[] }[]> {
    const c = await rawClient();
    try {
      const r = await c.query(
        "select p.proname as name, coalesce(p.proargnames, '{}') as args" +
          " from pg_proc p join pg_namespace n on n.oid = p.pronamespace" +
          " where n.nspname = 'private' order by 1",
      );
      return r.rows.map((x) => ({ name: x.name as string, args: x.args as string[] }));
    } finally {
      await c.end();
    }
  }

  it("INV-Z12 (S14): private 의 판정 함수는 어느 노출 스키마에도 없다", async () => {
    // **이름을 손으로 안 적는다.** 적으면 오타가 404 를 받아 통과하고, 여덟 번째가
    // 생겼을 때 목록에 넣는 것을 잊으면 그 줄이 조용히 아무것도 안 하게 된다.
    const fns = await privateFunctions();
    expect(fns.map((f) => f.name)).toEqual([
      "is_chat_member",
      "is_study_host",
      "is_study_member",
      "profile_username_from_meta",
      "study_accepted_count",
      "study_accepts_applications",
      "study_is_recruiting",
      "study_is_visible",
    ]);

    const open: string[] = [];
    for (const f of fns) {
      // 인자 이름을 데이터베이스에서 읽어 실어 보낸다. 값은 아무 uuid 나 되지만
      // **키 이름이 맞아야** 404 가 "그런 함수 없음"을 뜻한다.
      const args = Object.fromEntries(f.args.map((a) => [a, ZERO_UUID]));
      for (const schema of EXPOSED_SCHEMAS) {
        if ((await callRpc(schema, f.name, args)) !== 404) open.push(schema + "." + f.name);
      }
    }
    expect(open, "RPC 로 열려 있다: " + open.join(", ")).toEqual([]);
  });

  it("INV-Z12: 이 두드리기가 노출을 실제로 감지할 수 있다", async () => {
    // **반대 절반.** 위 검사가 전부 404 인 것은, 두드리는 방법이 틀려서 언제나 404 여도
    // 똑같이 보인다. 그래서 **열려 있다고 알고 있는 함수 하나**를 같은 방법으로 두드려
    // 404 가 아닌 것을 확인한다. 이게 실패하면 위 검사는 알리바이다.
    const status = await callRpc("public", "increment_post_views", { p_post_id: ZERO_UUID });
    expect(status, "노출된 함수마저 404 다 — 두드리는 방법이 틀렸다").not.toBe(404);
  });

  it("INV-Z12: 그래도 화면이 읽는 계산 컬럼은 살아 있다", async () => {
    // 노출을 끊은 것과 기능을 끊은 것은 다르다. 앞의 검사만 보면 전부 깨뜨린 상태도 통과한다.
    const row = await anonClient()
      .from("studies")
      .select("id, accepted_count, recruiting")
      .eq("id", studyId)
      .single();
    expect(row.error, "계산 컬럼이 같이 죽었다: " + row.error?.message).toBeNull();
    expect(row.data).toMatchObject({ id: studyId, accepted_count: 2, recruiting: true });
  });

  it("INV-Z12: 노출된 스키마에 새 판정 통로가 생기면 여기서 걸린다", async () => {
    // 위 검사는 **지금 있는 함수들**이 안 열려 있는지만 본다. 다음에 추가되는 것은
    // 구조로 물어야 걸린다.
    //
    // 무엇을 통로로 보나:
    //   · 노출된 스키마에 있고
    //   · 함수이고 — 프로시저는 반환 타입이 없어서 아래 트리거 조건에 조용히 걸러진다
    //   · 트리거를 반환하지 않고 (PostgREST 가 안 연다)
    //   · **definer 이거나, private 의 판정 함수를 부르거나** — 뒤쪽이 핵심이다.
    //     anon 에게 private 실행 권한이 있으므로 invoker 껍데기 하나면 문이 다시 열린다
    //     (2026-09-05 실측: 껍데기를 심으니 비로그인 호출이 200 + 판정값을 받았다).
    //   · 인자가 **행 하나**가 아닌 것. 계산 컬럼(`recruiting(studies)`)은 부르려면 그 행을
    //     이미 읽을 수 있어야 하고 그 읽기에 정책이 걸리므로 통로가 아니다. 다만 그 면제는
    //     **인자가 딱 하나이고 그것이 공개 테이블의 행 타입일 때**만 성립한다 —
    //     `f(studies, uuid)` 는 계산 컬럼이 아니고, 행은 지어내서 보내면 그만이다.
    const c = await rawClient();
    try {
      const r = await c.query(
        "select n.nspname as schema, p.proname as name" +
          " from pg_proc p join pg_namespace n on n.oid = p.pronamespace" +
          " where n.nspname = any($1)" +
          "   and p.prokind = 'f'" +
          "   and coalesce(pg_get_function_result(p.oid), '') <> 'trigger'" +
          "   and (p.prosecdef or p.prosrc like '%private.%')" +
          "   and not (p.pronargs = 1 and exists (" +
          "         select 1 from pg_type ty" +
          "           join pg_class rel on rel.oid = ty.typrelid" +
          "           join pg_namespace rn on rn.oid = rel.relnamespace" +
          "          where ty.oid = p.proargtypes[0] and ty.typtype = 'c'" +
          "            and rn.nspname = 'public' and rel.relkind in ('r', 'v', 'm')))" +
          " order by 1, 2",
        [[...EXPOSED_SCHEMAS]],
      );
      const found = r.rows.map((x) => x.schema + "." + x.name);

      // **정확히 같기를 요구하지 않는다.** 그러면 보류(P9)를 풀어 이 함수를 옮기는 날
      // 보안을 강화한 diff 가 검사를 깨뜨리고, 그건 사람에게 "검사를 고쳐 통과시키자"를
      // 가르친다. 여기서는 **모르는 것이 있는가**만 묻는다.
      expect(found.filter((n) => n !== "public.increment_post_views")).toEqual([]);
    } finally {
      await c.end();
    }
  });

  it("INV-Z12: 알고 열어 둔 통로는 하나이고, 그 이름이 여기 적혀 있다", async () => {
    // 위 검사가 허용하는 이름을 **별도 단언으로** 고정한다. 두 가지(모르는 통로가 없다 ·
    // 아는 통로가 무엇인가)를 한 단언에 묶으면 어느 쪽이 깨졌는지 못 가른다.
    //
    // `increment_post_views` 는 앱이 PostgREST 로 부르므로 private 으로 옮기면 앱도 못
    // 부른다. "조회수를 누가 어떻게 올리나"를 정해야 풀리는 문제라 보류 P9 에서
    // **"그대로 두고 배포한다"로 정했다.** 그 결정이 여기 적혀 있다는 것이 기록이다.
    const c = await rawClient();
    try {
      const r = await c.query(
        "select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace" +
          " where n.nspname = 'public' and p.proname = 'increment_post_views'",
      );
      expect(r.rowCount, "P9 가 풀렸으면 위 검사의 예외 이름도 같이 지운다").toBe(1);
    } finally {
      await c.end();
    }
  });

  it("INV-Z12: 다른 노출 스키마에는 마이그레이션이 함수를 만들 수 없다", async () => {
    // 노출 스키마가 둘인데(`config.toml` 의 `schemas`) 위 구조 검사는 둘 다 훑는다.
    // 그렇다면 `graphql_public` 쪽에 판정 함수를 심는 변이가 있어야 그 훑기가 붙들리는데,
    // **심을 수가 없다** — 그 스키마는 `supabase_admin` 소유라 마이그레이션이 쓰는
    // `postgres` 역할이 함수를 못 만든다(2026-09-05 실측: permission denied).
    //
    // 그래서 변이 대신 **그 사실 자체**를 붙든다. 이 통로가 닫혀 있는 이유가 "아무도 안
    // 하기 때문"이 아니라 "권한이 없기 때문"이라는 것이 여기 적혀 있어야, 언젠가 소유권이
    // 바뀌면 그때 이 줄이 판단을 요구한다.
    const c = await rawClient();
    try {
      const r = await c.query(
        "select has_schema_privilege(current_user, 'graphql_public', 'CREATE') as can",
      );
      expect(r.rows[0].can, "graphql_public 에 만들 수 있게 됐다 — 그쪽 변이를 등록해야 한다").toBe(
        false,
      );
    } finally {
      await c.end();
    }
  });

  it("INV-Z12: 노출된 스키마의 뷰는 소유자 권한으로 돌지 않는다", async () => {
    // 뷰도 통로다. postgres 소유의 뷰를 만들면 그 조회가 소유자 권한으로 돌아 밑 테이블의
    // 정책을 지나지 않고, PostgREST 는 그것을 테이블처럼 연다. INV-Z11 의 행동 검사는
    // 전부 `participants` **테이블**을 읽으므로 그 상태에서도 전부 초록불로 남는다.
    // 지금 뷰가 0개라 단언은 빈 목록이지만, 생기는 날 이 줄이 판단을 요구한다.
    const c = await rawClient();
    try {
      const r = await c.query(
        "select n.nspname || '.' || c.relname as v" +
          " from pg_class c join pg_namespace n on n.oid = c.relnamespace" +
          " where n.nspname = any($1) and c.relkind in ('v', 'm')" +
          "   and coalesce((select option_value from pg_options_to_table(c.reloptions)" +
          "                  where option_name = 'security_invoker'), 'off') <> 'true'" +
          " order by 1",
        [[...EXPOSED_SCHEMAS]],
      );
      expect(r.rows.map((x) => x.v)).toEqual([]);
    } finally {
      await c.end();
    }
  });
});
