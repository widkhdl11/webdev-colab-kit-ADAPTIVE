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
  askAsRole,
  chatIdOf,
  createStudy,
  createUser,
  cleanupCreatedUsers,
  rawClient,
  type TestUser,
} from "./helpers";

let host: TestUser;
let members: TestUser[];

beforeAll(async () => {
  host = await createUser("host");
  members = await Promise.all([
    createUser("member1"),
    createUser("member2"),
    createUser("member3"),
    createUser("member4"),
  ]);
}, 60_000);

afterAll(async () => {
  await cleanupCreatedUsers();
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

  // 아래 둘은 `askAsRole` 이 아니라 슈퍼유저 직결로 함수를 부른다. **일부러 그렇다** —
  // 여기서 보는 것은 "누가 묻느냐"가 아니라 "닫으면/차면 값이 바뀌느냐"이고, 그 축은
  // 화자와 무관하다. 화자별 비교는 아래 INV-P9 describe 가 따로 한다.
  it("INV-P6(S6): 호스트가 닫으면 인원이 그대로여도 모집 중이 아니다", async () => {
    const study = await createStudy(host.id, { max_participants: 5 });
    const c = await rawClient();
    try {
      const before = await c.query("select private.study_is_recruiting($1) as v", [study]);
      expect(before.rows[0].v).toBe(true);

      await admin.from("studies").update({ closed_at: new Date().toISOString() }).eq("id", study);

      const after = await c.query("select private.study_is_recruiting($1) as v", [study]);
      expect(after.rows[0].v).toBe(false);
    } finally {
      await c.end();
    }
  });

  it("INV-P6(S7): 정원이 차면 사람이 아무것도 안 해도 모집 중이 아니다", async () => {
    const study = await createStudy(host.id, { max_participants: 2 });
    const c = await rawClient();
    try {
      expect((await c.query("select private.study_is_recruiting($1) as v", [study])).rows[0].v)
        .toBe(true);

      await apply(study, members[0].id);
      await accept(study, members[0].id); // 호스트 + 1 = 정원 2

      // closed_at 은 여전히 비어 있다. 그런데도 모집 중이 아니다 — 파생값이기 때문이다.
      const { data } = await admin.from("studies").select("closed_at").eq("id", study).single();
      expect(data!.closed_at).toBeNull();
      expect((await c.query("select private.study_is_recruiting($1) as v", [study])).rows[0].v)
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

    // 정원 2 = 호스트 + 한 명이면 꽉 찬다
    const s = await createStudy(h.id, { max_participants: 2 });
    await acceptedMember(s, m1.id);

    // 대기 중인 신청을 하나 끼워 둔다 — 세는 것이 '수락된' 사람인지를 여기서 가른다.
    // 이게 없으면 상태 조건을 통째로 빼도 수가 그대로여서 아무도 못 알아챈다.
    const waiting = await createUser("p9-waiting");
    await apply(s, waiting.id);

    // 0010 부터 이 함수들은 API 에 안 열려 있다. "누가 묻든 같은 답"은 그대로 확인해야
    // 하므로 역할만 바꿔 가며 묻는다 — 판정이 부르는 사람에 따라 갈리는지가 이 검사의 내용이다.
    const asAuth = await askAsRole("authenticated", "select private.study_is_recruiting($1) as v", [s], h.id);
    const asAnon = await askAsRole("anon", "select private.study_is_recruiting($1) as v", [s]);
    const countAuth = await askAsRole("authenticated", "select private.study_accepted_count($1) as v", [s], h.id);
    const countAnon = await askAsRole("anon", "select private.study_accepted_count($1) as v", [s]);

    expect(countAuth).toBe(2); // 대기 중인 한 명은 안 센다
    expect(countAnon).toBe(2); // 고치기 전에는 0 이었다
    expect(asAuth).toBe(false);
    expect(asAnon).toBe(false); // 고치기 전에는 true 였다
  });

  it("INV-P9 (반대 절반): 자리가 남았으면 로그인하지 않은 연결도 모집중으로 답한다", async () => {
    const h = await createUser("p9-host2");
    const s = await createStudy(h.id, { max_participants: 5 });

    const countAnon = await askAsRole("anon", "select private.study_accepted_count($1) as v", [s]);
    const asAnon = await askAsRole("anon", "select private.study_is_recruiting($1) as v", [s]);

    expect(countAnon).toBe(1); // 호스트 자신
    expect(asAnon).toBe(true);
  });

  it("INV-P9 (S12): 파생값을 열었다고 참여자 명단이 열린 것은 아니다", async () => {
    const h = await createUser("p9-host3");
    const m = await createUser("p9-m");
    const s = await createStudy(h.id, { max_participants: 5 });
    await acceptedMember(s, m.id);

    // 수는 보인다 — 계산 컬럼으로도, 판정 함수로도
    const count = await askAsRole("anon", "select private.study_accepted_count($1) as v", [s]);
    expect(count).toBe(2);

    // 그런데 행은 안 보인다
    const rows = await anonClient().from("participants").select("user_id").eq("study_id", s);
    expect(rows.data).toHaveLength(0);
  });
});

describe("INV-P9: 화면이 실제로 읽는 것은 계산 컬럼이다", () => {
  // 같은 파생 계산이 데이터베이스에 네 벌 있다 — 함수 쌍(study_accepted_count·
  // study_is_recruiting)과 계산 컬럼 쌍(accepted_count(studies)·recruiting(studies)).
  // **위 describe 는 앞의 둘만 부르는데, 화면 코드는 뒤의 둘만 쓴다.**
  // 그래서 계산 컬럼에서 강제 장치를 빼는 변이가 전부 초록불이었다.

  it("INV-P9 (S11, 화면 경로): 꽉 찬 스터디를 로그인하지 않은 연결이 계산 컬럼으로 물어도 마감으로 답한다", async () => {
    const h = await createUser("p9c-host");
    const m1 = await createUser("p9c-m1");

    const s = await createStudy(h.id, { max_participants: 2 });
    await acceptedMember(s, m1.id);

    const waiting = await createUser("p9c-waiting");
    await apply(s, waiting.id); // 대기 중인 사람은 인원에 안 들어간다

    const asHost = await h.client
      .from("studies")
      .select("accepted_count, recruiting")
      .eq("id", s)
      .single();
    const asAnon = await anonClient()
      .from("studies")
      .select("accepted_count, recruiting")
      .eq("id", s)
      .single();

    expect(asHost.data).toEqual({ accepted_count: 2, recruiting: false });
    // 묻는 사람이 달라도 답이 같아야 한다. 계산 컬럼이 부르는 사람의 시야로 읽으면
    // 여기가 0 · true 로 갈라진다 — 목록 화면의 「모집중」 배지가 그 값으로 그려진다.
    expect(asAnon.data).toEqual({ accepted_count: 2, recruiting: false });
  });

  it("INV-P9 (반대 절반, 화면 경로): 자리가 남았으면 계산 컬럼도 모집중으로 답한다", async () => {
    const h = await createUser("p9c-host2");
    const s = await createStudy(h.id, { max_participants: 5 });

    const asAnon = await anonClient()
      .from("studies")
      .select("accepted_count, recruiting")
      .eq("id", s)
      .single();

    expect(asAnon.data).toEqual({ accepted_count: 1, recruiting: true }); // 호스트 자신
  });

});

// **이것도 자기 describe 다.** 위 describe(INV-P9) 안에 두면 이 검사의 전체 이름이
// 이름표 둘을 동시에 달아, INV-P6 변이의 「잡혔다」와 INV-P9 변이의 「잡혔다」가
// 같은 검사 하나에서 나온다 — 판정이 무엇을 잡았는지 못 가른다.
describe("INV-P6: 화면이 읽는 계산 컬럼도 같은 규칙으로 파생된다", () => {
  it("INV-P6 (S6, 화면 경로): 호스트가 닫으면 계산 컬럼도 마감으로 답한다", async () => {
    const h = await createUser("p6c-host");
    const s = await createStudy(h.id, { max_participants: 5 }); // 자리는 남아 있다

    const before = await anonClient()
      .from("studies")
      .select("accepted_count, recruiting")
      .eq("id", s)
      .single();
    expect(before.data).toEqual({ accepted_count: 1, recruiting: true });

    await h.client.from("studies").update({ closed_at: new Date().toISOString() }).eq("id", s);

    // 자리는 여전히 남았는데도 마감이다 — 닫은 것은 사람이다. 목록의 「모집중만」 필터와
    // 카드의 배지가 이 값 하나로 갈린다.
    const after = await anonClient()
      .from("studies")
      .select("accepted_count, recruiting")
      .eq("id", s)
      .single();
    expect(after.data).toEqual({ accepted_count: 1, recruiting: false });
  });

});

// **describe 를 따로 뺐다.** 판정기는 실패한 테스트의 전체 이름(describe 제목 + it 제목)에
// 이름표를 찾는다. 위 describe 안에 두면 이 검사의 전체 이름에 INV-P9 가 섞여, INV-P9 변이가
// 이 INV-P6 검사만 깨뜨려도 「INV-P9 를 담은 테스트가 잡았다」로 보고된다.
describe("INV-P6: 지워진 스터디는 모집 중이 아니다", () => {
  // 2026-09-05 에 INV-P6 의 공식에 「그리고 지워지지 않았다」를 넣으면서 이름표를 여기로 옮겼다.
  // 그전에는 INV-P9(「누가 묻든 같은 답」)를 달고 있었는데, 이것은 「지워졌으면 거짓」이라
  // 성질이 다르다.
  //
  // **같은 공식이 데이터베이스에 두 벌 있다** — 화면이 읽는 계산 컬럼(recruiting(studies))과
  // 함수 쌍(study_is_recruiting). 아래 둘이 그 두 벌을 각각 누른다. 한 벌만 누르면 다른 벌에서
  // 조건을 지워도 전부 초록불이다(실제로 그랬다).
  it("INV-P6 (S7-1): 지워진 스터디는 계산 컬럼도 모집 중이 아니라고 답한다", async () => {
    const h = await createUser("p6c-host3");
    const s = await createStudy(h.id, { max_participants: 5 });

    const before = await h.client
      .from("studies")
      .select("accepted_count, closed_at, recruiting")
      .eq("id", s)
      .single();
    // 인원 1 은 호스트다 — 개설과 동시에 수락된 참여자가 된다(INV-P4).
    expect(before.data).toEqual({ accepted_count: 1, closed_at: null, recruiting: true });

    const { error } = await h.client
      .from("studies")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", s);
    expect(error, "삭제 표시가 정책에 막혔다").toBeNull();

    // 지워진 스터디는 호스트에게만 보인다(INV-Z6). 그 호스트 화면에서도 모집 중이면 안 된다 —
    // 「다시 열기」 같은 것이 이 값으로 갈린다.
    //
    // **인원과 닫은 시각을 같이 고정한다**(S7-1 의 "인원도 닫은 시각도 그대로인데 답이 바뀐다").
    // recruiting 만 보면, 삭제할 때 closed_at 을 같이 채우는 구현이 와도 통과한다 — 그때
    // 거짓으로 만든 것은 삭제 조건이 아니라 닫은 시각이고, INV-P6 의 새 가지는 죽어 있다.
    const after = await h.client
      .from("studies")
      .select("accepted_count, closed_at, recruiting")
      .eq("id", s)
      .single();
    expect(after.data).toEqual({ accepted_count: 1, closed_at: null, recruiting: false });
  });

  it("INV-P6 (S7-1, 함수 쌍): 지워진 스터디는 study_is_recruiting 도 거짓으로 답한다", async () => {
    const h = await createUser("p6rpc-host");
    const s = await createStudy(h.id, { max_participants: 5 });

    const before = await askAsRole("authenticated", "select private.study_is_recruiting($1) as v", [s], h.id);
    expect(before).toBe(true);

    const { error } = await h.client
      .from("studies")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", s);
    expect(error, "삭제 표시가 정책에 막혔다").toBeNull();

    // 이 함수는 security definer 라 정책을 지나지 않는다. 그래서 「안 보인다」가 대신
    // 막아 주지 않고, 삭제 조건이 본문에 있어야만 거짓이 된다.
    //
    // **인원과 닫은 시각을 같이 고정한다**(S7-1 의 "인원도 닫은 시각도 그대로인데 답이 바뀐다").
    // 계산 컬럼 쪽 검사에는 이 보강이 있는데 여기 없으면, 삭제할 때 closed_at 을 같이 채우는
    // 구현이 왔을 때 이 검사만 초록불로 남는다.
    const count = await askAsRole("authenticated", "select private.study_accepted_count($1) as v", [s], h.id);
    expect(count, "삭제가 인원까지 바꿨다").toBe(1);
    const closed = await h.client.from("studies").select("closed_at").eq("id", s).single();
    expect(closed.data!.closed_at, "삭제가 닫은 시각을 같이 채웠다").toBeNull();

    const after = await askAsRole("authenticated", "select private.study_is_recruiting($1) as v", [s], h.id);
    // null 이 아니라 **거짓**이어야 한다 — 행 선택 조건이 바뀌어 값이 안 나오는 것과 다르다.
    expect(after).toBe(false);
  });
});

// INV-P6 의 2026-09-05 조항: **모집 마감일은 모집 상태에 들어가지 않는다.**
// 마감일은 호스트가 적어 둔 목표이고 모집을 닫는 것은 호스트다(`closed_at`).
//
// 이 조항이 스펙·0008 주석·화면 목록 문서 셋에 적혀 있었는데 붙드는 검사가 하나도 없었다 —
// 다른 검사의 스터디는 전부 마감일이 비어 있어서, 파생값에 `recruit_until >= current_date` 를
// 더해도 아무 검사가 안 깨졌다. 「마감 임박」이라는 말을 읽고 모집 상태에 배선하는 것이
// 정확히 이 조항이 막으려는 것이다.
describe("INV-P6: 마감일은 모집 상태가 아니다", () => {
  /** 어제가 마감일인 스터디. 데이터베이스가 보는 오늘을 기준으로 만든다. */
  async function studyWithPastDeadline(username: string) {
    const pg = await rawClient();
    let yesterday: string;
    try {
      yesterday = (await pg.query("select (current_date - 1)::text as d")).rows[0].d as string;
    } finally {
      await pg.end();
    }
    const h = await createUser(username);
    const s = await createStudy(h.id, { max_participants: 5, recruit_until: yesterday });
    return { h, s };
  }

  it("INV-P6: 마감일이 지나도 계산 컬럼은 모집 중이라고 답한다", async () => {
    const { s } = await studyWithPastDeadline("p6dl-host");
    const row = await anonClient()
      .from("studies")
      .select("accepted_count, recruiting")
      .eq("id", s)
      .single();
    expect(row.data).toEqual({ accepted_count: 1, recruiting: true });
  });

  it("INV-P6: 마감일이 지나도 study_is_recruiting 은 참으로 답한다", async () => {
    const { h, s } = await studyWithPastDeadline("p6dl-host2");
    const r = await askAsRole("authenticated", "select private.study_is_recruiting($1) as v", [s], h.id);
    expect(r).toBe(true);
  });

  it("INV-P4: 마감일이 지난 스터디도 신청과 수락이 그대로 지나간다", async () => {
    // 파생값만 보면 절반이다. 마감일 검사가 **쓰기 경로**(정원 트리거)에 들어가도
    // 위 둘은 초록불이다 — 그때 사용자는 「모집중」을 보고 신청했다가 거부당한다.
    const { h, s } = await studyWithPastDeadline("p6dl-host3");
    const applicant = await createUser("p6dl-apply");
    await apply(s, applicant.id);
    const accepted = await accept(s, applicant.id);
    expect(accepted.error, "마감일이 지났다고 수락이 막혔다").toBeNull();

    const row = await h.client.from("studies").select("accepted_count").eq("id", s).single();
    expect(row.data!.accepted_count).toBe(2);
  });
});
