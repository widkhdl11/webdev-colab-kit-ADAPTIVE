// 근거 스펙: docs/specs/write-authorization.md (INV-Z1 ~ INV-Z11)
//
// **여기서 쓰는 연결은 전부 공개 키다.** 그 키는 브라우저 번들에도 들어가는 값이라,
// 이 연결로 할 수 있는 일이 곧 "아무나 할 수 있는 일"이다. 서버 코드를 한 줄도 거치지
// 않고 데이터베이스를 직접 부르는 것이 정확히 INV-Z5 가 말하는 우회 경로다.

import type { SupabaseClient } from "@supabase/supabase-js";
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

  // **수정 액션의 실패 설계 전체가 이 한 줄 위에 서 있다** — 「거부는 오류가 아니라 0행」.
  // 그것을 주장하는 것이 유닛의 가짜 데이터베이스뿐이었다(2026-09-06 test-auditor).
  // 실제로 오류가 온다면 사용자는 "고칠 수 있는 모집글이 아닙니다"가 아니라
  // "잠시 뒤 다시 시도해 주세요"를 읽는다 — 그 상태에서도 유닛은 전부 초록불이다.
  it("INV-Z3(실패경로): 남의 글은 오류가 아니라 0행으로 온다 — 앱이 세우는 문구의 근거", async () => {
    const { data, error } = await stranger.client
      .from("posts")
      .update({ title: "가로챈 제목" })
      .eq("id", postId)
      .eq("author_id", stranger.id)
      .select("id")
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  // 삭제도 갱신과 같은 전제 위에 있다 — 「거부는 오류가 아니라 0행」. 앱은 그 0행을
  // 보고 "지울 수 있는 모집글이 아닙니다"를 세운다.
  it("INV-Z3(실패경로·삭제): 남의 글은 삭제도 오류가 아니라 0행으로 온다", async () => {
    const { data, error } = await stranger.client
      .from("posts")
      .delete()
      .eq("id", postId)
      .eq("author_id", stranger.id)
      .select("study_id")
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
    // 반대 절반 — 실제로 안 지워졌다
    const { data: still } = await admin.from("posts").select("id").eq("id", postId).maybeSingle();
    expect(still).not.toBeNull();
  });

  // **필터가 아니라 정책이 막는 모양.** 위 검사는 `.eq("author_id", stranger.id)` 가 이미
  // 행을 0개로 만들어서 정책이 평가될 기회조차 없었다 — 앱이 밟는 경로와 같아 값어치는
  // 있지만, 「정책에 걸린 행도 0행으로 온다」는 여전히 아무도 안 잰다
  // (2026-09-06 test-auditor). 여기서는 필터가 그 행을 맞히고 정책만 막는다.
  it("INV-Z3(실패경로·삭제): 정책이 막은 행도 오류가 아니라 0행으로 온다", async () => {
    const { data, error } = await stranger.client
      .from("posts")
      .delete()
      .eq("id", postId)
      .select("study_id")
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
    const { data: still } = await admin.from("posts").select("id").eq("id", postId).maybeSingle();
    expect(still).not.toBeNull();
  });

  // **삭제의 반대 절반.** 이것이 없으면 `posts_delete_author` 를 `using (false)` 로 바꾸거나
  // 통째로 지워도 통합 스위트가 전부 초록불이다 — 그 상태의 제품은 **작성자가 자기 글을
  // 못 지운다**(화면은 "지울 수 있는 모집글이 아닙니다"만 계속 낸다). 스펙이 S4·S9·S20b 로
  // 세 번 요구한 「정책이 전부를 막아 버려서 통과한 것이 아님을 보인다」가 삭제에만 빠져
  // 있었다 (2026-09-06 test-auditor · security-reviewer).
  //
  // 뒤 검사들이 `postId` 를 쓰므로 **이 검사 전용 글을 새로 만들어 지운다.**
  it("INV-Z3(반대 절반·삭제): 작성자는 자기 글을 지우고, 지운 행을 돌려받는다", async () => {
    const { data: 새글, error: 만들기 } = await host.client
      .from("posts")
      .insert({ author_id: host.id, study_id: studyId, title: "지울 글", content: "본문" })
      .select("id")
      .single();
    expect(만들기).toBeNull();

    const { data, error } = await host.client
      .from("posts")
      .delete()
      .eq("id", (새글 as { id: string }).id)
      .eq("author_id", host.id)
      .select("study_id")
      .maybeSingle();

    expect(error).toBeNull();
    // 앱이 리다이렉트 목적지로 쓰는 값이 실물에서도 이 모양인 것을 여기서 굳힌다
    expect(data).toEqual({ study_id: studyId });

    const { data: gone } = await admin
      .from("posts")
      .select("id")
      .eq("id", (새글 as { id: string }).id)
      .maybeSingle();
    expect(gone).toBeNull();
  });

  it("INV-Z3(반대 절반): 작성자의 같은 요청은 고친 행을 돌려준다", async () => {
    const { data, error } = await host.client
      .from("posts")
      .update({ title: "작성자가 같은 체인으로 고침" })
      .eq("id", postId)
      .eq("author_id", host.id)
      .select("id")
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toEqual({ id: postId });
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
    // 준비물은 **진짜 이미지**여야 한다 — 2026-09-06 에 INV-E4 가 버킷에 형식 제한을
    // 걸면서, 형식 없는 blob 은 여기 도착하기 전에 거부된다. 이 검사의 주제는 형식이
    // 아니라 「남이 올린 것을 지울 수 있나」라서 준비물만 바꾼다.
    const path = `${host.id}/avatar.png`;
    const png = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      ),
      (c) => c.charCodeAt(0),
    );
    const up = await host.client.storage
      .from("avatars")
      .upload(path, new Blob([png], { type: "image/png" }), {
        contentType: "image/png",
        upsert: true,
      });
    expect(up.error).toBeNull();

    await stranger.client.storage.from("avatars").remove([path]);

    const { data } = await admin.storage.from("avatars").list(host.id);
    expect(data?.map((f) => f.name)).toContain("avatar.png");
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

/**
 * INV-Z14 — 새 모집글은 「모집 중」인 스터디에만 붙는다.
 *
 * 갈래 셋을 **따로** 본다(지워짐 · 닫힘 · 정원 참). 하나로 묶으면 그중 하나만 붙들려 있어도
 * 「잡혔다」가 나오고 나머지는 아무도 안 붙드는데 숫자는 만점이 된다 — 2026-09-06 에 프로필
 * 가시성에서 실제로 그랬다(`.claude/rules/tdd.md`).
 *
 * 앱이 실제로 보내는 다섯 칸(summary 포함)으로 넣는다 — 유닛 검사는 「무엇을 보내는가」를
 * 보고 여기서는 「그 값이 정책을 지나는가」를 본다. 칸이 다르면 그 사이가 빈다.
 */
describe("INV-Z14: 새 모집글은 모집 중인 스터디에만 붙는다", () => {
  const 모집글 = (studyId: string, title: string) => ({
    author_id: host.id,
    study_id: studyId,
    title,
    summary: null,
    content: "본문",
  });

  it("INV-Z14 (S21, 실패경로): 호스트가 모집을 닫은 스터디에는 새 모집글이 안 들어간다", async () => {
    const s = await createStudy(host.id);
    await admin.from("studies").update({ closed_at: new Date().toISOString() }).eq("id", s);

    const { error } = await host.client.from("posts").insert(모집글(s, "닫은 뒤에 쓴 글"));

    expect(error).not.toBeNull();
    const { data: rows } = await admin.from("posts").select("id").eq("study_id", s);
    expect(rows).toHaveLength(0);
  });

  it("INV-Z14 (S21b, 실패경로): 호스트가 지운 스터디에도 안 들어간다", async () => {
    const s = await createStudy(host.id);
    await admin.from("studies").update({ deleted_at: new Date().toISOString() }).eq("id", s);

    const { error } = await host.client.from("posts").insert(모집글(s, "지운 뒤에 쓴 글"));

    expect(error).not.toBeNull();
    const { data: rows } = await admin.from("posts").select("id").eq("study_id", s);
    expect(rows).toHaveLength(0);
  });

  it("INV-Z14 (S21c, 실패경로): 정원이 다 찬 스터디에도 안 들어간다", async () => {
    // 정원 2 = 호스트 + 한 명. 한 명을 수락하면 「모집중」이 꺼진다.
    const s = await createStudy(host.id, { max_participants: 2 });
    const member = await createUser("z14-member");
    await acceptedMember(s, member.id);

    const { error } = await host.client.from("posts").insert(모집글(s, "정원이 찬 뒤에 쓴 글"));

    expect(error).not.toBeNull();
    const { data: rows } = await admin.from("posts").select("id").eq("study_id", s);
    expect(rows).toHaveLength(0);
  });

  it("INV-Z14 (S21d, 반대 절반): 모집 중인 스터디에는 그대로 들어간다", async () => {
    const s = await createStudy(host.id, { max_participants: 5 });

    const { error } = await host.client.from("posts").insert(모집글(s, "모집 중에 쓴 글"));

    expect(error).toBeNull();
    const { data: rows } = await admin.from("posts").select("id").eq("study_id", s);
    expect(rows).toHaveLength(1);
  });

  it("INV-Z14: 정원이 찼다가 한 명이 나가면 다시 쓸 수 있다", async () => {
    const s = await createStudy(host.id, { max_participants: 2 });
    const member = await createUser("z14-leaver");
    await acceptedMember(s, member.id);

    const 찼을때 = await host.client.from("posts").insert(모집글(s, "찼을 때"));
    expect(찼을때.error).not.toBeNull();

    await admin
      .from("participants")
      .update({ status: "withdrawn" })
      .eq("study_id", s)
      .eq("user_id", member.id);

    const 나간뒤 = await host.client.from("posts").insert(모집글(s, "한 명이 나간 뒤"));
    expect(나간뒤.error).toBeNull();
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

  it("INV-Z12 (S20): private 의 판정 함수는 어느 노출 스키마에도 없다", async () => {
    // **이름을 손으로 안 적는다.** 적으면 오타가 404 를 받아 통과하고, 여덟 번째가
    // 생겼을 때 목록에 넣는 것을 잊으면 그 줄이 조용히 아무것도 안 하게 된다.
    const fns = await privateFunctions();
    expect(fns.map((f) => f.name)).toEqual([
      "chat_topic_uuid",
      "is_chat_member",
      "is_study_host",
      "is_study_member",
      "profile_is_visible",
      "profile_username_from_meta",
      "study_accepted_count",
      "study_accepts_applications",
      "study_is_editable",
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

  it("INV-Z12 (S20b): 그래도 화면이 읽는 계산 컬럼은 살아 있다", async () => {
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

  it("INV-Z12 (반대 절반): 그 질의가 실제로 뷰를 집어낸다", async () => {
    // 위 검사는 지금 빈 목록을 단언한다. **빈 목록은 「없다」와 「이 질의가 아무것도 못 본다」를
    // 구분하지 못한다** — `pg_options_to_table` 이나 `relkind` 조건이 틀어져 영원히 0행을 내도
    // 아무도 모른다. 그래서 뷰를 하나 심어 보고 되감는다(`list-order.test.ts` 가 제약을
    // 트랜잭션 안에서만 떼는 것과 같은 방식).
    const c = await rawClient();
    try {
      await c.query("begin");
      await c.query("create view public.__z12_probe as select 1 as one");
      const seen = await c.query(
        "select n.nspname || '.' || c.relname as v" +
          " from pg_class c join pg_namespace n on n.oid = c.relnamespace" +
          " where n.nspname = any($1) and c.relkind in ('v', 'm')" +
          "   and coalesce((select option_value from pg_options_to_table(c.reloptions)" +
          "                  where option_name = 'security_invoker'), 'off') <> 'true'" +
          " order by 1",
        [[...EXPOSED_SCHEMAS]],
      );
      expect(
        seen.rows.map((x) => x.v),
        "심은 뷰를 못 집어냈다 — 위 검사는 감지할 수 없는 상태로 초록불이었다",
      ).toContain("public.__z12_probe");

      // 그리고 `security_invoker` 를 켠 뷰는 안 집어내야 한다. 이게 없으면 조건을
      // 「노출 스키마의 뷰 전부」로 넓혀도 위가 통과하고, 그러면 안전한 뷰까지 걸린다.
      await c.query("alter view public.__z12_probe set (security_invoker = true)");
      const after = await c.query(
        "select n.nspname || '.' || c.relname as v" +
          " from pg_class c join pg_namespace n on n.oid = c.relnamespace" +
          " where n.nspname = any($1) and c.relkind in ('v', 'm')" +
          "   and coalesce((select option_value from pg_options_to_table(c.reloptions)" +
          "                  where option_name = 'security_invoker'), 'off') <> 'true'" +
          " order by 1",
        [[...EXPOSED_SCHEMAS]],
      );
      expect(
        after.rows.map((x) => x.v),
        "invoker 로 켠 뷰까지 걸린다 — 조건이 너무 넓다",
      ).not.toContain("public.__z12_probe");
    } finally {
      await c.query("rollback").catch(() => {});
      await c.end();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INV-Z13 — 프로필은 볼 이유가 있는 사람에게만 보인다
//
// 이 describe 는 **제 준비물을 스스로 만든다.** 위쪽 테스트들이 공유 studyId 의 상태를
// 바꾸므로(모집 닫기·소프트 삭제), 가시성처럼 그 상태에 답이 달린 검사를 얹으면
// 실행 순서가 판정을 바꾼다.
// ═══════════════════════════════════════════════════════════════════════════
describe("INV-Z13: 프로필은 볼 이유가 있는 사람에게만 보인다", () => {
  let zHost: TestUser;      // 스터디를 열고 모집글도 쓴 사람 — ②③
  let zMemberA: TestUser;   // 수락된 멤버 — ④-1
  let zMemberB: TestUser;   // 또 다른 수락된 멤버
  let zPending: TestUser;   // 대기 중인 신청자
  let zPending2: TestUser;  // 또 다른 대기 중인 신청자
  let zKicked: TestUser;    // 강퇴됐지만 대화에 메시지를 남긴 사람 — ④-2
  let zLoner: TestUser;     // 아무것도 안 한 사람 — 어느 갈래에도 안 걸린다
  let zOutsider: TestUser;  // 그 스터디와 무관한 로그인 사용자
  let zStudyId: string;

  /** 그 프로필이 이 연결에 보이는가. 정책이 막으면 행이 없는 것과 같은 모양으로 나온다. */
  async function sees(viewer: { from: SupabaseClient["from"] } | SupabaseClient, targetId: string) {
    const { data, error } = await (viewer as SupabaseClient)
      .from("profiles")
      .select("id, username")
      .eq("id", targetId)
      .maybeSingle();
    if (error) throw new Error(`프로필 조회가 오류로 끝났다(막힌 것과 다르다): ${error.message}`);
    return data !== null;
  }

  beforeAll(async () => {
    zHost = await createUser("z13-host");
    zMemberA = await createUser("z13-mem-a");
    zMemberB = await createUser("z13-mem-b");
    zPending = await createUser("z13-pending");
    zPending2 = await createUser("z13-pending2");
    zKicked = await createUser("z13-kicked");
    zLoner = await createUser("z13-loner");
    zOutsider = await createUser("z13-outsider");

    zStudyId = await createStudy(zHost.id, { max_participants: 10 });
    await acceptedMember(zStudyId, zMemberA.id);
    await acceptedMember(zStudyId, zMemberB.id);
    await apply(zStudyId, zPending.id);
    await apply(zStudyId, zPending2.id);

    // 강퇴 전에 말을 남긴다 — 강퇴가 메시지를 지우지 않는다는 것이 INV-Z6 의 계약이다.
    await acceptedMember(zStudyId, zKicked.id);
    const chatId = await chatIdOf(zStudyId);
    const { error: mErr } = await admin
      .from("chat_messages")
      .insert({ chat_id: chatId, sender_id: zKicked.id, content: "먼저 갑니다" });
    if (mErr) throw new Error(`메시지 생성 실패: ${mErr.message}`);
    const { error: kErr } = await admin
      .from("participants")
      .update({ status: "kicked" })
      .eq("study_id", zStudyId)
      .eq("user_id", zKicked.id);
    if (kErr) throw new Error(`강퇴 실패: ${kErr.message}`);

    await admin
      .from("posts")
      .insert({ author_id: zHost.id, study_id: zStudyId, title: "z13 모집", content: "본문" });
  }, 60_000);

  describe("① 본인", () => {
    it("INV-Z13 ①: 아무것도 안 한 사람도 자기 프로필은 읽는다", async () => {
      expect(await sees(zLoner.client, zLoner.id)).toBe(true);
    });
  });

  describe("②③ 공개한 사람 — 스터디를 열었거나 모집글을 썼다", () => {
    it("INV-Z13 (S14): 비로그인도 호스트 겸 작성자의 프로필을 읽는다", async () => {
      // 이것이 좁히면 깨지는 자리다 — /posts/<id> 는 보호 경로가 아니고 그 화면이
      // "누가 여는 스터디인가"를 그린다.
      expect(await sees(anonClient(), zHost.id)).toBe(true);
    });

    it("호스트의 소개·지역·관심분야까지 함께 읽힌다 — 화면이 그 열들을 그린다", async () => {
      const { data } = await anonClient()
        .from("profiles")
        .select("username, bio, region, interest_category")
        .eq("id", zHost.id)
        .maybeSingle();
      expect(data).not.toBeNull();
      expect(Object.keys(data!).sort()).toEqual(["bio", "interest_category", "region", "username"]);
    });

    it("INV-Z13 ②: 스터디가 지워지면 호스트도 그 갈래로는 안 보인다 — 가시성 정의를 그대로 쓴다", async () => {
      const solo = await createUser("z13-gone-host");
      const goneStudy = await createStudy(solo.id);
      expect(await sees(anonClient(), solo.id)).toBe(true); // 지우기 전
      await admin.from("studies").update({ deleted_at: new Date().toISOString() }).eq("id", goneStudy);
      expect(await sees(anonClient(), solo.id)).toBe(false); // 지운 뒤
      expect(await sees(solo.client, solo.id)).toBe(true); // 본인은 ① 로 여전히 보인다
    });
  });

  describe("③ 모집글의 작성자 — 호스트와 갈리는 경우", () => {
    // **이 상태는 앱 경로로 못 만든다.** `posts_insert_author` 가 작성자에게 그 스터디의
    // 호스트일 것을 요구하고(0010), 열 권한이 `study_id` 갱신을 막는다(INV-Z8). 그래서
    // 오늘 작성자는 언제나 호스트이고, ③ 이 참이면 ② 도 반드시 참이다.
    //
    // **그래도 ③ 을 따로 붙드는 이유:** 계약이 ②③ 을 따로 적었고(INV-Z13), 호스트가 아닌
    // 사람이 모집글을 쓰게 되는 날 ③ 이 유일한 근거가 된다. 이 검사를 쓰기 전에는
    // ③ 만 지우는 diff 를 아무도 못 잡았다 — 변이가 ②③ 을 함께 빼서 ② 덕에 「잡혔다」로
    // 나왔기 때문이다. 그래서 준비물을 정책 밖(admin)에서 만든다.
    let zAuthorOnly: TestUser;

    beforeAll(async () => {
      zAuthorOnly = await createUser("z13-author");
      const { error } = await admin.from("posts").insert({
        author_id: zAuthorOnly.id,
        study_id: zStudyId,
        title: "호스트가 아닌 사람이 쓴 모집글",
        content: "본문",
      });
      if (error) throw new Error(`모집글 생성 실패: ${error.message}`);
    }, 30_000);

    it("INV-Z13 ③ (S14b): 비로그인도 모집글 작성자의 프로필을 읽는다 — 호스트가 아니어도", async () => {
      expect(await sees(anonClient(), zAuthorOnly.id)).toBe(true);
    });

    it("그 사람은 ②④ 어느 갈래에도 안 걸린다 — 위 검사가 ③ 만 붙든다는 근거", async () => {
      // 이것이 없으면 위 검사는 다른 갈래 덕에 통과할 수 있고, 그러면 ③ 을 지워도 초록불이다.
      const { data: asHost } = await admin.from("studies").select("id").eq("host_id", zAuthorOnly.id);
      expect(asHost, "스터디를 열었다면 ② 로도 보인다").toEqual([]);
      const { data: asPart } = await admin.from("participants").select("study_id").eq("user_id", zAuthorOnly.id);
      expect(asPart, "참여 행이 있으면 ④-1 로도 보인다").toEqual([]);
      const { data: asSender } = await admin.from("chat_messages").select("id").eq("sender_id", zAuthorOnly.id);
      expect(asSender, "메시지가 있으면 ④-2 로도 보인다").toEqual([]);
    });
  });
  describe("④-1 관계 — INV-Z11 이 보여 주기로 정한 참여자 행의 주인", () => {
    it("INV-Z13 ④-1 (S16): 수락된 멤버는 같은 스터디의 다른 수락된 멤버를 읽는다", async () => {
      expect(await sees(zMemberA.client, zMemberB.id)).toBe(true);
    });

    it("호스트는 대기 중인 신청자의 프로필을 읽는다 — 수락 화면이 그것을 그린다", async () => {
      expect(await sees(zHost.client, zPending.id)).toBe(true);
    });

    it("INV-Z13 (S17, 실패경로): 대기 중인 신청자는 다른 신청자를 못 읽는다", async () => {
      // INV-Z11 이 그 참여 행을 안 보여 주므로 프로필도 안 딸려 온다.
      expect(await sees(zPending.client, zPending2.id)).toBe(false);
    });

    it("INV-Z13 (실패경로): 수락된 멤버도 대기 중인 신청자는 못 읽는다", async () => {
      expect(await sees(zMemberA.client, zPending.id)).toBe(false);
    });

    it("INV-Z13 (실패경로): 무관한 로그인 사용자는 멤버를 못 읽는다", async () => {
      expect(await sees(zOutsider.client, zMemberA.id)).toBe(false);
    });
  });

  describe("④-2 관계 — 내가 읽을 수 있는 대화의 보낸 사람", () => {
    it("INV-Z13 ④-2 (S18): 강퇴된 사람의 옛 메시지가 남은 방에서 그 이름이 보인다", async () => {
      // ④-1 로는 안 잡힌다: 강퇴된 참여 행은 status='kicked' 라 남은 멤버에게 안 보인다.
      // 그것을 여기서 함께 단언한다 — 안 그러면 이 검사가 무엇 덕에 통과하는지 안 갈린다.
      const { data: row } = await zMemberA.client
        .from("participants")
        .select("user_id")
        .eq("study_id", zStudyId)
        .eq("user_id", zKicked.id)
        .maybeSingle();
      expect(row, "강퇴 행이 멤버에게 보이면 이 검사는 ④-1 덕에 통과한다").toBeNull();

      expect(await sees(zMemberA.client, zKicked.id)).toBe(true);
    });

    it("INV-Z13 (S19, 실패경로): 그 대화에 없는 사람은 같은 프로필을 못 읽는다", async () => {
      expect(await sees(zOutsider.client, zKicked.id)).toBe(false);
      expect(await sees(anonClient(), zKicked.id)).toBe(false);
    });
  });

  describe("④-1 은 participants_read 와 같은 문장이어야 한다", () => {
    // 0011 은 이 계약을 주석과 데이터베이스 코멘트에 두 번 적어 놓았는데 강제하는 것이
    // 없었다. 두 벌이 어긋나는 날 프로필이 명단보다 넓어지거나(새고) 좁아지는데(이름이
    // 빈칸이 되는데), **위의 행동 검사들은 그것을 못 본다** — 새로 생긴 갈래를 밟는
    // 준비물이 없기 때문이다. 그래서 표현식 자체를 대조한다(INV-Z5 검사와 같은 방식).

    /** 괄호 깊이 0 에서만 `OR` 로 가른다. 통째로 감싼 바깥 괄호는 먼저 벗긴다. */
    function topLevelOr(expr: string): string[] {
      let e = expr.trim();
      while (e.startsWith("(") && e.endsWith(")")) {
        let d = 0;
        let wrapsAll = true;
        for (let i = 0; i < e.length; i++) {
          if (e[i] === "(") d++;
          else if (e[i] === ")") d--;
          if (d === 0 && i < e.length - 1) { wrapsAll = false; break; }
        }
        if (!wrapsAll) break;
        e = e.slice(1, -1).trim();
      }
      const parts: string[] = [];
      let depth = 0;
      let last = 0;
      for (let i = 0; i < e.length; i++) {
        if (e[i] === "(") depth++;
        else if (e[i] === ")") depth--;
        else if (depth === 0 && e.startsWith(" OR ", i)) {
          parts.push(e.slice(last, i));
          i += 3;
          last = i + 1;
        }
      }
      parts.push(e.slice(last));
      return parts.map((p) => p.trim()).filter(Boolean);
    }

    /**
     * 두 표현식을 같은 모양으로 만든다. 정책은 데이터베이스가 다시 적어 준 문장이고
     * 함수는 내가 쓴 원문이라, 괄호와 형변환과 공백이 다르다 — 그 셋만 지운다.
     * 판정 자체(어떤 컬럼과 어떤 함수)는 그대로 남으므로 조건이 바뀌면 안 맞는다.
     */
    function canon(sql: string): string {
      return sql
        .replace(/--[^\n]*/g, " ")
        .replace(/\s+/g, "")
        .replace(/\(SELECTauth\.uid\(\)ASuid\)/gi, "p_viewer_id")
        .replace(/::[a-z_]+/gi, "")
        .replace(/[()]/g, "")
        .toLowerCase();
    }

    it("INV-Z13 ④-1: 참여자 명단의 판정 셋이 프로필 판정 함수에도 그대로 있다", async () => {
      const pg = await rawClient();
      try {
        const pol = await pg.query(
          "select qual from pg_policies where schemaname=$1 and tablename=$2 and policyname=$3",
          ["public", "participants", "participants_read"],
        );
        const fn = await pg.query(
          "select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace" +
            " where n.nspname=$1 and p.proname=$2",
          ["private", "profile_is_visible"],
        );
        expect(pol.rows[0]?.qual, "participants_read 가 없다").toBeTruthy();
        expect(fn.rows[0]?.prosrc, "private.profile_is_visible 이 없다").toBeTruthy();

        const branches = topLevelOr(pol.rows[0].qual as string);
        expect(
          branches.length,
          "participants_read 의 갈래 수가 바뀌었다 — profile_is_visible 의 ④-1 도 같이 봐야 한다",
        ).toBe(3);

        // 정책은 `auth.uid()`·맨 컬럼을 쓰고 함수는 `p_viewer_id`·`pt.` 를 쓴다. 그 둘만 맞춘다.
        const body = canon(fn.rows[0].prosrc as string);
        for (const b of branches) {
          // **컬럼 이름을 먼저 맞추고 나서 정규화한다.** 순서를 바꾸면 공백이 지워진 뒤라
          // 단어 경계가 안 먹는다 — `is_study_host(study_id` 가 한 낱말로 붙어 버려서 치환이
          // 조용히 아무것도 안 하고, 그러면 검사가 「없다」로 빨간불이 된다(실제로 그랬다).
          const wanted = canon(
            b
              .replace(/\buser_id\b/g, "pt.user_id")
              .replace(/\bstudy_id\b/g, "pt.study_id")
              .replace(/\bstatus\b/g, "pt.status"),
          );
          expect(body, `참여자 명단의 판정이 프로필 쪽에 없다: ${b}`).toContain(wanted);
        }
      } finally {
        await pg.end();
      }
    });

    it("반대 절반: 아무 문장이나 통과하지는 않는다", async () => {
      // 위 검사가 무엇이든 「들어 있다」로 통과하면 대조가 아니다. 실제로 없는 판정을
      // 하나 지어서 안 걸리는 것을 본다.
      const pg = await rawClient();
      try {
        const fn = await pg.query(
          "select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace" +
            " where n.nspname=$1 and p.proname=$2",
          ["private", "profile_is_visible"],
        );
        const body = canon(fn.rows[0].prosrc as string);
        expect(body).not.toContain(canon("private.is_study_admin(pt.study_id, p_viewer_id)"));
      } finally {
        await pg.end();
      }
    });
  });
  describe("명부를 긁을 수 없다 — 이 불변식이 실제로 막는 것", () => {
    it("INV-Z13 (S15, 실패경로): 비로그인은 아무 관계 없는 사람의 프로필을 못 읽는다", async () => {
      expect(await sees(anonClient(), zLoner.id)).toBe(false);
    });

    it("INV-Z13 (S15, 실패경로): 로그인한 사람도 마찬가지다", async () => {
      expect(await sees(zOutsider.client, zLoner.id)).toBe(false);
    });

    it("INV-Z13: 필터 없이 통째로 긁으면 공개한 사람들만 나온다", async () => {
      // **이것이 원래 뚫려 있던 모양이다** — 필터 없는 select 하나로 회원 명부 전체가 나왔다.
      const { data, error } = await anonClient().from("profiles").select("id");
      expect(error).toBeNull();
      const ids = new Set((data ?? []).map((r) => r.id as string));
      expect(ids.has(zHost.id), "스터디를 연 사람은 공개다").toBe(true);
      for (const [name, u] of [
        ["아무것도 안 한 사람", zLoner],
        ["대기 중인 신청자", zPending],
        ["수락된 멤버", zMemberA],
        ["강퇴된 사람", zKicked],
      ] as const) {
        expect(ids.has(u.id), `${name}의 프로필이 명부 긁기에 나왔다`).toBe(false);
      }
    });

    it("INV-Z13 (S15, 실패경로): 골라서 물어도 같다 — 행 상한에 잘려 통과한 것이 아니다", async () => {
      // 위 검사에는 필터도 range 도 없어서 `max_rows`(config.toml 의 1000)가 조용히 자른다.
      // 프로필이 그보다 많아지면 정책을 `using (true)` 로 열어 놔도 뒤쪽이 잘려
      // 「안 나왔다」로 통과한다. 다섯을 이름으로 집어 오면 상한이 안 걸린다.
      const targets = [zHost, zLoner, zPending, zMemberA, zKicked] as const;
      const { data, error } = await anonClient()
        .from("profiles")
        .select("id")
        .in("id", targets.map((u) => u.id));
      expect(error).toBeNull();
      const ids = new Set((data ?? []).map((r) => r.id as string));
      expect(ids.has(zHost.id), "스터디를 연 사람은 공개다").toBe(true);
      for (const [name, u] of [
        ["아무것도 안 한 사람", zLoner],
        ["대기 중인 신청자", zPending],
        ["수락된 멤버", zMemberA],
        ["강퇴된 사람", zKicked],
      ] as const) {
        expect(ids.has(u.id), `${name}의 프로필이 나왔다`).toBe(false);
      }
    });
  });
});

/**
 * INV-Z15 — 스터디를 고치는 것은 호스트만. INV-Z16 — 지워진 스터디는 더 안 고쳐진다.
 *
 * **갈래를 따로 본다.** 스터디 행 자신과 딸린 요일·시간은 **강제 장치가 다르다** —
 * 앞은 `studies_update_host` 정책이고 뒤는 `study_sessions` 의 삽입·삭제 정책이다.
 * 한 검사로 묶으면 뒤쪽이 통째로 열려 있어도 「잡혔다」가 나온다. 2026-09-07 이전에
 * 실제로 뒤쪽이 열려 있었다 — 그 정책들이 부르던 `private.is_study_host` 는 삭제 표시를
 * 안 본다.
 */
describe("INV-Z15: 스터디를 고치는 것은 그 스터디의 호스트만", () => {
  it("INV-Z15(실패경로 S22): 호스트가 아닌 사람의 갱신은 아무것도 안 바꾼다", async () => {
    const s = await createStudy(host.id, { title: "원래 이름", max_participants: 5 });

    await stranger.client
      .from("studies")
      .update({ title: "가로챈 이름", max_participants: 2 })
      .eq("id", s);

    const { data } = await admin
      .from("studies")
      .select("title, max_participants")
      .eq("id", s)
      .single();
    expect(data!.title).toBe("원래 이름");
    expect(data!.max_participants).toBe(5);
  });

  // **앱이 실제로 보내는 열한 칸을 그대로 싣는다.** 두 칸만 시험하면 `0002` 의 갱신 권한
  // 목록에서 나머지를 빼도 전부 초록불인데, 그 상태의 제품은 **수정 화면의 저장이 100%
  // 실패한다** — `readStudyFields` 는 언제나 열한 칸을 통째로 싣고, 열 권한은 정책보다
  // 앞에서 요청을 통째로 떨어뜨린다 (2026-09-07 test-auditor).
  it("INV-Z15(반대 절반 S22b): 호스트 자신은 앱이 보내는 열한 칸 전부로 갱신에 성공한다", async () => {
    const s = await createStudy(host.id, { title: "원래 이름", max_participants: 5 });

    const 열한칸 = {
      title: "고친 이름",
      summary: "고친 한 줄",
      description: "고친 설명",
      category_id: "language",
      region_code: "busan",
      location_detail: "서면역 카페",
      meeting_mode: "hybrid",
      max_participants: 7,
      starts_on: "2026-10-01",
      ends_on: "2026-12-31",
      recruit_until: "2026-09-30",
    };
    const { error } = await host.client.from("studies").update(열한칸).eq("id", s);
    expect(error).toBeNull();

    const { data } = await admin
      .from("studies")
      .select(Object.keys(열한칸).join(", "))
      .eq("id", s)
      .single();
    expect(data).toMatchObject(열한칸);
  });

  it("INV-Z15(실패경로 S22c): 호스트도 스터디를 남에게 넘길 수 없다", async () => {
    const s = await createStudy(host.id);

    // 열 단위 갱신 권한이 정책보다 **앞에서** 판정한다 — `host_id` 가 목록에 없으므로
    // 요청이 통째로 거부되고, 같이 실은 제목도 안 바뀐다.
    const { error } = await host.client
      .from("studies")
      .update({ title: "넘기면서 제목도", host_id: stranger.id })
      .eq("id", s);
    expect(error).not.toBeNull();

    const { data } = await admin.from("studies").select("host_id, title").eq("id", s).single();
    expect(data!.host_id).toBe(host.id);
    expect(data!.title).toBe("테스트 스터디");
  });

  // **넣기와 지우기를 갈라 둔다.** 강제 장치가 정책 두 개로 따로 있으므로, 한 검사에
  // 묶으면 지우기 정책이 통째로 열려도 넣기 쪽 단언이 대신 빨간불을 내서 변이 판정이
  // 「잡혔다」가 된다 (2026-09-07 test-auditor · security-reviewer).
  it("INV-Z15(실패경로 S22d): 남은 그 스터디에 요일·시간을 못 넣는다", async () => {
    const s = await createStudy(host.id);

    const ins = await stranger.client
      .from("study_sessions")
      .insert({ study_id: s, weekday: 3, starts_at: "10:00", ends_at: "12:00" });
    expect(ins.error).not.toBeNull();

    const { data: after } = await admin.from("study_sessions").select("id").eq("study_id", s);
    expect(after).toHaveLength(0);
  });

  it("INV-Z15(실패경로 S22e): 남은 그 스터디의 요일·시간을 못 지운다", async () => {
    const s = await createStudy(host.id);
    const { data: slot } = await admin
      .from("study_sessions")
      .insert({ study_id: s, weekday: 1, starts_at: "19:00", ends_at: "21:00" })
      .select("id")
      .single();

    await stranger.client.from("study_sessions").delete().eq("id", slot!.id as string);
    const { data: after } = await admin.from("study_sessions").select("id").eq("study_id", s);
    expect(after).toHaveLength(1);
  });

  it("INV-Z15(반대 절반): 호스트는 자기 스터디의 요일·시간을 넣고 지운다", async () => {
    const s = await createStudy(host.id);

    const ins = await host.client
      .from("study_sessions")
      .insert({ study_id: s, weekday: 2, starts_at: "20:00", ends_at: "22:00" })
      .select("id")
      .single();
    expect(ins.error).toBeNull();

    const del = await host.client.from("study_sessions").delete().eq("id", ins.data!.id as string);
    expect(del.error).toBeNull();

    const { data: after } = await admin.from("study_sessions").select("id").eq("study_id", s);
    expect(after).toHaveLength(0);
  });
});

describe("INV-Z16: 지워진 것으로 표시된 스터디는 더 이상 갱신되지 않는다", () => {
  async function deletedStudy(): Promise<string> {
    const s = await createStudy(host.id, { title: "지워질 스터디", max_participants: 5 });
    await admin.from("studies").update({ deleted_at: new Date().toISOString() }).eq("id", s);
    return s;
  }

  it("INV-Z16(실패경로 S23): 지워진 스터디는 호스트도 못 고친다", async () => {
    const s = await deletedStudy();

    await host.client.from("studies").update({ title: "되살아난 이름" }).eq("id", s);

    const { data } = await admin.from("studies").select("title").eq("id", s).single();
    expect(data!.title).toBe("지워질 스터디");
  });

  it("INV-Z16(실패경로 S23b): 되살리는 경로가 없다", async () => {
    const s = await deletedStudy();

    await host.client.from("studies").update({ deleted_at: null }).eq("id", s);

    const { data } = await admin.from("studies").select("deleted_at").eq("id", s).single();
    expect(data!.deleted_at).not.toBeNull();
  });

  it("INV-Z16(실패경로 S23c): 지워진 스터디에 요일·시간을 못 넣는다", async () => {
    const s = await createStudy(host.id);
    await admin.from("studies").update({ deleted_at: new Date().toISOString() }).eq("id", s);

    const ins = await host.client
      .from("study_sessions")
      .insert({ study_id: s, weekday: 5, starts_at: "07:00", ends_at: "08:00" });
    expect(ins.error).not.toBeNull();

    const { data: after } = await admin.from("study_sessions").select("id").eq("study_id", s);
    expect(after).toHaveLength(0);
  });

  it("INV-Z16(실패경로 S23f): 지워진 스터디의 요일·시간을 못 지운다", async () => {
    const s = await createStudy(host.id);
    const { data: slot } = await admin
      .from("study_sessions")
      .insert({ study_id: s, weekday: 4, starts_at: "07:00", ends_at: "08:00" })
      .select("id")
      .single();
    await admin.from("studies").update({ deleted_at: new Date().toISOString() }).eq("id", s);

    await host.client.from("study_sessions").delete().eq("id", slot!.id as string);
    const { data: after } = await admin.from("study_sessions").select("id").eq("study_id", s);
    expect(after).toHaveLength(1);
  });

  // INV-Z17 — 0017 이 쓰기만 좁히고 조회는 `using (true)` 로 남겨 둔 것을 0018 이 닫는다.
  it("INV-Z17(실패경로 S24): 지워진 스터디의 요일·시간은 비로그인에게 안 보인다", async () => {
    const s = await createStudy(host.id);
    await admin
      .from("study_sessions")
      .insert({ study_id: s, weekday: 2, starts_at: "20:00", ends_at: "22:00" });
    await admin.from("studies").update({ deleted_at: new Date().toISOString() }).eq("id", s);

    const { data } = await anonClient().from("study_sessions").select("id").eq("study_id", s);
    expect(data).toHaveLength(0);
  });

  it("INV-Z17(반대 절반 S24b): 지워지지 않은 스터디의 요일·시간은 비로그인에게 보인다", async () => {
    const s = await createStudy(host.id);
    await admin
      .from("study_sessions")
      .insert({ study_id: s, weekday: 3, starts_at: "10:00", ends_at: "12:00" });

    // 정책이 조회를 통째로 막아 버려서 위 검사가 통과한 것이 아님을 보인다
    const { data } = await anonClient().from("study_sessions").select("id").eq("study_id", s);
    expect(data).toHaveLength(1);
  });

  it("INV-Z17(반대 절반 S24c): 호스트는 자기가 지운 스터디의 요일·시간을 계속 본다", async () => {
    const s = await createStudy(host.id);
    await admin
      .from("study_sessions")
      .insert({ study_id: s, weekday: 4, starts_at: "07:00", ends_at: "08:00" });
    await admin.from("studies").update({ deleted_at: new Date().toISOString() }).eq("id", s);

    // 「볼 수 있는가」는 호스트에게 참이다 (INV-Z11) — 좁히는 것과 뺏는 것은 다르다
    const { data } = await host.client.from("study_sessions").select("id").eq("study_id", s);
    expect(data).toHaveLength(1);
  });

  it("INV-Z16(반대 절반 S23d): 삭제 자신은 갱신이므로 통과해야 한다", async () => {
    const s = await createStudy(host.id);

    const { error } = await host.client
      .from("studies")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", s);
    expect(error).toBeNull();

    const { data } = await admin.from("studies").select("deleted_at").eq("id", s).single();
    expect(data!.deleted_at).not.toBeNull();
  });
});
