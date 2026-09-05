// 근거 스펙: docs/specs/write-authorization.md (INV-Z1 ~ INV-Z7)
//
// **여기서 쓰는 연결은 전부 공개 키다.** 그 키는 브라우저 번들에도 들어가는 값이라,
// 이 연결로 할 수 있는 일이 곧 "아무나 할 수 있는 일"이다. 서버 코드를 한 줄도 거치지
// 않고 데이터베이스를 직접 부르는 것이 정확히 INV-Z5 가 말하는 우회 경로다.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  anonClient,
  apply,
  chatIdOf,
  createStudy,
  createUser,
  cleanupUsers,
  rawClient,
  type TestUser,
} from "./helpers";

let host: TestUser;
let stranger: TestUser;
let member: TestUser;
let studyId: string;
let postId: string;
const created: string[] = [];

beforeAll(async () => {
  host = await createUser("z-host");
  stranger = await createUser("z-stranger");
  member = await createUser("z-member");
  created.push(host.id, stranger.id, member.id);

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
  await cleanupUsers(created);
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
    created.push(victim.id);

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
    created.push(applicant.id);
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
