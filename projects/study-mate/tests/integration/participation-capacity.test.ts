// 근거 스펙: docs/specs/participation-capacity.md (INV-P1 ~ INV-P9)
//
// 전부 실제 로컬 Postgres 에 붙어서 돈다. 이 불변식들의 강제 위치가 데이터베이스라서다 —
// 제약·트리거가 실제로 거부하는지는 거부당해 봐야 안다.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  accept,
  acceptedMember,
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
let members: TestUser[];
const created: string[] = [];

beforeAll(async () => {
  host = await createUser("host");
  members = await Promise.all([
    createUser("member1"),
    createUser("member2"),
    createUser("member3"),
    createUser("member4"),
  ]);
  created.push(host.id, ...members.map((m) => m.id));
}, 60_000);

afterAll(async () => {
  await cleanupUsers(created);
});

describe("INV-P1: 수락된 참여자 수는 정원을 넘지 않는다", () => {
  it("INV-P1(실패경로 S1): 정원이 찬 스터디에 한 명 더 수락하면 거부한다", async () => {
    // 정원 3 = 호스트 1 + 멤버 2
    const study = await createStudy(host.id, { max_participants: 3 });
    await apply(study, members[0].id);
    await apply(study, members[1].id);
    await apply(study, members[2].id);

    expect((await accept(study, members[0].id)).error).toBeNull();
    expect((await accept(study, members[1].id)).error).toBeNull();

    const over = await accept(study, members[2].id);
    expect(over.error).not.toBeNull();
    expect(over.error?.message).toContain("정원");
  });

  it("INV-P1(반대 절반): 자리가 남아 있으면 수락된다 — 전부 막아서 통과한 게 아님을 보인다", async () => {
    const study = await createStudy(host.id, { max_participants: 5 });
    await apply(study, members[0].id);
    expect((await accept(study, members[0].id)).error).toBeNull();

    const { count } = await admin
      .from("participants")
      .select("*", { count: "exact", head: true })
      .eq("study_id", study)
      .eq("status", "accepted");
    expect(count).toBe(2); // 호스트 + 멤버 하나
  });

  it("INV-P1(경합 S5): 남은 자리가 하나일 때 두 수락이 동시에 들어오면 하나만 성공한다", async () => {
    // 정원 3 = 호스트 + 두 자리. 한 자리를 채워 남은 자리를 하나로 만든다.
    const study = await createStudy(host.id, { max_participants: 3 });
    await apply(study, members[0].id);
    await apply(study, members[1].id);
    await apply(study, members[2].id);
    expect((await accept(study, members[0].id)).error).toBeNull();

    // 여기서부터가 핵심이다. 트랜잭션 두 개를 **겹쳐 놓아야** 한다 — A 를 커밋한 뒤에 B 를
    // 돌리면 B 는 A 의 결과를 보고 스스로 거부하므로, 잠금이 없어도 통과해 버린다.
    // (실제로 처음 쓴 판이 그랬다: 잠금을 빼는 변이를 넣어도 초록불이었다.)
    const a = await rawClient();
    const b = await rawClient();
    try {
      const upd = `update participants set status='accepted' where study_id=$1 and user_id=$2`;

      await a.query("begin");
      await a.query(upd, [study, members[1].id]); // A 의 트리거가 스터디 행을 잠근다

      let bSettled = false;
      const bDone = b
        .query("begin")
        .then(() => b.query(upd, [study, members[2].id]))
        .then(
          () => { bSettled = true; return { ok: true as const }; },
          (e: Error) => { bSettled = true; return { ok: false as const, message: e.message }; },
        );

      // A 가 아직 안 끝났는데 B 가 통과해 버리는지 본다. 잠금이 있으면 B 는 여기서 멈춰 있다.
      await new Promise((r) => setTimeout(r, 800));
      const blockedWhileAOpen = !bSettled;

      await a.query("commit");
      const bResult = await bDone;
      if (bResult.ok) await b.query("commit");
      else await b.query("rollback");

      // ① 겹친 동안 B 가 실제로 멈춰 있었나 — 이것이 잠금을 직접 붙드는 단언이다
      expect(blockedWhileAOpen).toBe(true);
      // ② 뒤에 온 쪽은 거부됐나
      expect(bResult.ok).toBe(false);
      if (!bResult.ok) expect(bResult.message).toContain("정원");
      // ③ 결과가 정원을 안 넘었나
      const { count } = await admin
        .from("participants")
        .select("*", { count: "exact", head: true })
        .eq("study_id", study)
        .eq("status", "accepted");
      expect(count).toBe(3); // 4 가 나오면 경합이 안 닫힌 것이다
    } finally {
      await a.end();
      await b.end();
    }
  }, 30_000);
});

describe("INV-P2: 현재 인원은 저장된 값이 아니라 세어 얻는 값이다", () => {
  it("INV-P2: 인원수를 담는 컬럼이 스키마에 존재하지 않는다", async () => {
    const c = await rawClient();
    try {
      const { rows } = await c.query(
        `select column_name from information_schema.columns
          where table_schema='public' and table_name='studies'`,
      );
      const names = rows.map((r) => r.column_name as string);
      // 이름을 하나 고르는 게 아니라 "인원/참여자 수"로 읽히는 컬럼이 하나도 없어야 한다.
      expect(names.filter((n) => /participant|member|count/.test(n))).toEqual(["max_participants"]);
    } finally {
      await c.end();
    }
  });

  it("INV-P2(S2): 강퇴하면 세는 값이 곧바로 줄어든다 — 갱신할 저장값이 없기 때문이다", async () => {
    const study = await createStudy(host.id, { max_participants: 5 });
    await apply(study, members[0].id);
    await apply(study, members[1].id);
    await accept(study, members[0].id);
    await accept(study, members[1].id);

    const countOf = async () =>
      (
        await admin
          .from("participants")
          .select("*", { count: "exact", head: true })
          .eq("study_id", study)
          .eq("status", "accepted")
      ).count;

    expect(await countOf()).toBe(3);
    const kick = await admin
      .from("participants")
      .update({ status: "kicked" })
      .eq("study_id", study)
      .eq("user_id", members[0].id);
    expect(kick.error).toBeNull();
    expect(await countOf()).toBe(2);
  });
});

describe("INV-P3: 정원을 현재 수락 인원보다 작게 줄일 수 없다", () => {
  it("INV-P3(실패경로 S3): 수락 인원이 3인데 정원을 2로 줄이면 거부한다", async () => {
    const study = await createStudy(host.id, { max_participants: 5 });
    await apply(study, members[0].id);
    await apply(study, members[1].id);
    await accept(study, members[0].id);
    await accept(study, members[1].id);

    const shrink = await admin.from("studies").update({ max_participants: 2 }).eq("id", study);
    expect(shrink.error).not.toBeNull();
    expect(shrink.error?.message).toContain("정원");
  });

  it("INV-P3(반대 절반): 수락 인원 이상으로는 줄일 수 있다", async () => {
    const study = await createStudy(host.id, { max_participants: 8 });
    await apply(study, members[0].id);
    await accept(study, members[0].id);

    expect((await admin.from("studies").update({ max_participants: 2 }).eq("id", study)).error)
      .toBeNull();
  });
});

describe("INV-P4: 모집이 닫힌 스터디에는 수락할 수 없다", () => {
  it("INV-P4(실패경로): 호스트가 닫은 뒤의 수락은 거부한다", async () => {
    const study = await createStudy(host.id, { max_participants: 5 });
    await apply(study, members[0].id);
    await admin.from("studies").update({ closed_at: new Date().toISOString() }).eq("id", study);

    const late = await accept(study, members[0].id);
    expect(late.error).not.toBeNull();
    expect(late.error?.message).toContain("마감");
  });
});

describe("INV-P5: 수락되면 그룹 채팅방 참여자가 된다", () => {
  it("INV-P5(S4): 수락된 사람이 채팅방 참여자 목록에 정확히 한 번 나타난다", async () => {
    const study = await createStudy(host.id, { max_participants: 5 });
    await apply(study, members[0].id);
    await accept(study, members[0].id);

    const { data: chat } = await admin.from("chats").select("id").eq("study_id", study).single();
    const { data: rows } = await admin
      .from("chat_participants")
      .select("user_id")
      .eq("chat_id", chat!.id)
      .eq("user_id", members[0].id);
    expect(rows).toHaveLength(1);
  });

  it("INV-P5: 강퇴 뒤 다시 수락되는 경로가 있어도 두 번 들어가지 않는다", async () => {
    const study = await createStudy(host.id, { max_participants: 5 });
    await apply(study, members[0].id);
    await accept(study, members[0].id);
    const { data: chat } = await admin.from("chats").select("id").eq("study_id", study).single();

    // 같은 사람을 다시 넣으려 해도 유일성이 막는다.
    const dup = await admin
      .from("chat_participants")
      .insert({ chat_id: chat!.id, user_id: members[0].id });
    expect(dup.error).not.toBeNull();

    const { count } = await admin
      .from("chat_participants")
      .select("*", { count: "exact", head: true })
      .eq("chat_id", chat!.id)
      .eq("user_id", members[0].id);
    expect(count).toBe(1);
  });
});

describe("INV-P6: 모집 상태는 저장되지 않고 파생된다", () => {
  it("INV-P6: 모집 상태를 담는 컬럼이 스키마에 존재하지 않는다", async () => {
    const c = await rawClient();
    try {
      const { rows } = await c.query(
        `select column_name from information_schema.columns
          where table_schema='public' and table_name='studies'`,
      );
      const names = rows.map((r) => r.column_name as string);
      expect(names).not.toContain("status");
      expect(names).not.toContain("recruiting");
      expect(names).toContain("closed_at"); // 저장하는 것은 사람의 행위 하나뿐이다
    } finally {
      await c.end();
    }
  });

  it("INV-P6(S6): 호스트가 닫으면 인원이 그대로여도 모집 중이 아니다", async () => {
    const study = await createStudy(host.id, { max_participants: 5 });
    const c = await rawClient();
    try {
      const before = await c.query("select public.study_is_recruiting($1) as v", [study]);
      expect(before.rows[0].v).toBe(true);

      await admin.from("studies").update({ closed_at: new Date().toISOString() }).eq("id", study);

      const after = await c.query("select public.study_is_recruiting($1) as v", [study]);
      expect(after.rows[0].v).toBe(false);
    } finally {
      await c.end();
    }
  });

  it("INV-P6(S7): 정원이 차면 사람이 아무것도 안 해도 모집 중이 아니다", async () => {
    const study = await createStudy(host.id, { max_participants: 2 });
    const c = await rawClient();
    try {
      expect((await c.query("select public.study_is_recruiting($1) as v", [study])).rows[0].v)
        .toBe(true);

      await apply(study, members[0].id);
      await accept(study, members[0].id); // 호스트 + 1 = 정원 2

      // closed_at 은 여전히 비어 있다. 그런데도 모집 중이 아니다 — 파생값이기 때문이다.
      const { data } = await admin.from("studies").select("closed_at").eq("id", study).single();
      expect(data!.closed_at).toBeNull();
      expect((await c.query("select public.study_is_recruiting($1) as v", [study])).rows[0].v)
        .toBe(false);
    } finally {
      await c.end();
    }
  });
});

describe("INV-P7: 참여자 상태는 결과를 전부 표현하고, 끝난 상태에서 되돌아가지 않는다", () => {
  it("INV-P7: 다섯 가지 결과가 모두 저장될 수 있다", async () => {
    const c = await rawClient();
    try {
      const { rows } = await c.query(
        `select pg_get_constraintdef(oid) as def from pg_constraint
          where conname = 'participants_status_allowed'`,
      );
      const def = rows[0].def as string;
      for (const s of ["pending", "accepted", "rejected", "withdrawn", "kicked"]) {
        expect(def).toContain(s);
      }
    } finally {
      await c.end();
    }
  });

  it("INV-P7(실패경로 S8): 이미 거절된 신청을 수락으로 되돌리면 거부한다", async () => {
    const study = await createStudy(host.id, { max_participants: 5 });
    await apply(study, members[0].id);
    expect(
      (
        await admin
          .from("participants")
          .update({ status: "rejected" })
          .eq("study_id", study)
          .eq("user_id", members[0].id)
      ).error,
    ).toBeNull();

    const revive = await accept(study, members[0].id);
    expect(revive.error).not.toBeNull();
    expect(revive.error?.message).toContain("끝난");
  });

  it("INV-P7(실패경로): 참여 중인 멤버를 대기로 되돌리면 거부한다", async () => {
    const study = await createStudy(host.id, { max_participants: 5 });
    await apply(study, members[0].id);
    await accept(study, members[0].id);

    const back = await admin
      .from("participants")
      .update({ status: "pending" })
      .eq("study_id", study)
      .eq("user_id", members[0].id);
    expect(back.error).not.toBeNull();
  });

  it("INV-P7(반대 절반): 허용된 전이는 지나간다 — 전부 막아서 통과한 게 아님을 보인다", async () => {
    const study = await createStudy(host.id, { max_participants: 5 });
    await apply(study, members[0].id);
    expect((await accept(study, members[0].id)).error).toBeNull();
    expect(
      (
        await admin
          .from("participants")
          .update({ status: "withdrawn" })
          .eq("study_id", study)
          .eq("user_id", members[0].id)
      ).error,
    ).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2026-09-05 (2) 리뷰 개정 — INV-P8 · INV-P9
//
// 앞의 검사들은 전부 rawClient()(슈퍼유저 직결)로 돈다. 그래서 행 수준 접근 정책을 안 타고,
// **파생값이 묻는 사람마다 다른 답을 준다는 것**을 볼 수 없었다. 아래 INV-P9 는 일부러
// 로그인하지 않은 공개 키 연결로 같은 질문을 한다.
// ─────────────────────────────────────────────────────────────────────────────

describe("INV-P8: 채팅방 구성원은 참가 상태에서 파생된다 — 양쪽 방향으로", () => {
  it("INV-P8 (S9): 강퇴되면 채팅 구성원에서 빠지고 대화를 더는 못 읽는다", async () => {
    const h = await createUser("p8-host");
    const m = await createUser("p8-member");
    created.push(h.id, m.id);

    const s = await createStudy(h.id, { max_participants: 5 });
    const chatId = await chatIdOf(s);
    await acceptedMember(s, m.id);

    // 들어가 있는 것을 먼저 확인한다 — 부재만 보는 검사는 절반이다
    const inChat = await admin
      .from("chat_participants")
      .select("id")
      .eq("chat_id", chatId)
      .eq("user_id", m.id);
    expect(inChat.data).toHaveLength(1);

    // 나가기 전에 남긴 말 하나
    await admin.from("chat_messages").insert({ chat_id: chatId, sender_id: m.id, content: "안녕" });

    await admin
      .from("participants")
      .update({ status: "kicked" })
      .eq("study_id", s)
      .eq("user_id", m.id);

    const afterKick = await admin
      .from("chat_participants")
      .select("id")
      .eq("chat_id", chatId)
      .eq("user_id", m.id);
    expect(afterKick.data).toHaveLength(0);

    // 실제로 못 읽는다
    const read = await m.client.from("chat_messages").select("id").eq("chat_id", chatId);
    expect(read.data).toHaveLength(0);

    // 그리고 못 쓴다
    const write = await m.client
      .from("chat_messages")
      .insert({ chat_id: chatId, sender_id: m.id, content: "아직 있다" });
    expect(write.error).not.toBeNull();

    // 남긴 말은 그대로 있다 — INV-Z6 과 같은 결
    const left = await admin.from("chat_messages").select("id").eq("chat_id", chatId).eq("sender_id", m.id);
    expect(left.data).toHaveLength(1);
  });

  it("INV-P8 (S10): 스스로 탈퇴해도 같은 결과가 된다", async () => {
    const h = await createUser("p8-host2");
    const m = await createUser("p8-leaver");
    created.push(h.id, m.id);

    const s = await createStudy(h.id, { max_participants: 5 });
    const chatId = await chatIdOf(s);
    await acceptedMember(s, m.id);

    const before = await admin
      .from("chat_participants")
      .select("id")
      .eq("chat_id", chatId)
      .eq("user_id", m.id);
    expect(before.data).toHaveLength(1);

    // 본인이 자기 손으로 나간다 — 공개 키 연결로
    const { error } = await m.client
      .from("participants")
      .update({ status: "withdrawn" })
      .eq("study_id", s)
      .eq("user_id", m.id);
    expect(error).toBeNull();

    const after = await admin
      .from("chat_participants")
      .select("id")
      .eq("chat_id", chatId)
      .eq("user_id", m.id);
    expect(after.data).toHaveLength(0);
  });

  it("INV-P8: 대기 중인 신청자는 애초에 채팅방에 들어가지 않는다", async () => {
    const h = await createUser("p8-host3");
    const w = await createUser("p8-waiting");
    created.push(h.id, w.id);

    const s = await createStudy(h.id, { max_participants: 5 });
    const chatId = await chatIdOf(s);
    await apply(s, w.id);

    const inChat = await admin
      .from("chat_participants")
      .select("id")
      .eq("chat_id", chatId)
      .eq("user_id", w.id);
    expect(inChat.data).toHaveLength(0);

    // 수락하면 들어간다 (부재 → 존재 쌍을 한 테스트 안에서 본다)
    await accept(s, w.id);
    const afterAccept = await admin
      .from("chat_participants")
      .select("id")
      .eq("chat_id", chatId)
      .eq("user_id", w.id);
    expect(afterAccept.data).toHaveLength(1);
  });
});

describe("INV-P9: 수락 인원과 모집 상태는 누가 묻든 같은 답을 준다", () => {
  it("INV-P9 (S11): 정원이 꽉 찬 스터디를 로그인하지 않은 연결이 물어도 마감으로 답한다", async () => {
    const h = await createUser("p9-host");
    const m1 = await createUser("p9-m1");
    created.push(h.id, m1.id);

    // 정원 2 = 호스트 + 한 명이면 꽉 찬다
    const s = await createStudy(h.id, { max_participants: 2 });
    await acceptedMember(s, m1.id);

    const asHost = await h.client.rpc("study_is_recruiting", { p_study_id: s });
    const asAnon = await anonClient().rpc("study_is_recruiting", { p_study_id: s });
    const countHost = await h.client.rpc("study_accepted_count", { p_study_id: s });
    const countAnon = await anonClient().rpc("study_accepted_count", { p_study_id: s });

    expect(countHost.data).toBe(2);
    expect(countAnon.data).toBe(2); // 고치기 전에는 0 이었다
    expect(asHost.data).toBe(false);
    expect(asAnon.data).toBe(false); // 고치기 전에는 true 였다
  });

  it("INV-P9 (반대 절반): 자리가 남았으면 로그인하지 않은 연결도 모집중으로 답한다", async () => {
    const h = await createUser("p9-host2");
    created.push(h.id);
    const s = await createStudy(h.id, { max_participants: 5 });

    const countAnon = await anonClient().rpc("study_accepted_count", { p_study_id: s });
    const asAnon = await anonClient().rpc("study_is_recruiting", { p_study_id: s });

    expect(countAnon.data).toBe(1); // 호스트 자신
    expect(asAnon.data).toBe(true);
  });

  it("INV-P9 (S12): 파생값을 열었다고 참여자 명단이 열린 것은 아니다", async () => {
    const h = await createUser("p9-host3");
    const m = await createUser("p9-m");
    created.push(h.id, m.id);
    const s = await createStudy(h.id, { max_participants: 5 });
    await acceptedMember(s, m.id);

    // 수는 보인다
    const count = await anonClient().rpc("study_accepted_count", { p_study_id: s });
    expect(count.data).toBe(2);

    // 그런데 행은 안 보인다
    const rows = await anonClient().from("participants").select("user_id").eq("study_id", s);
    expect(rows.data).toHaveLength(0);
  });
});
