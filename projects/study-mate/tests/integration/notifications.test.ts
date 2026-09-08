// 근거 스펙: docs/specs/notifications.md (INV-N1 ~ INV-N5)
//
// **여기서 판정에 쓰는 연결은 전부 공개 키다.** 그 키는 브라우저 번들에도 들어가는 값이라,
// 이 연결로 할 수 있는 일이 곧 "아무나 할 수 있는 일"이다. 준비물을 만들 때만 관리 연결을
// 쓴다 — 알림은 사람이 못 만드는 것이 계약이라(INV-N2), 준비물조차 **참가 사건을 실제로
// 일으켜서** 만든다. 알림 행을 직접 넣어 준비하면 그 순간 검사의 전제가 무너진다.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  anonClient,
  acceptedMember,
  apply,
  createStudy,
  createUser,
  cleanupCreatedUsers,
  rawClient,
  type TestUser,
} from "./helpers";

let host: TestUser;
let applicant: TestUser;
let rejected: TestUser;
let kicked: TestUser;
let stranger: TestUser;
let studyId: string;

/**
 * **조건 없는 쓰기를 그 사람의 눈으로 한 번 날려 보고, 몇 행이 바뀌었는지만 받는다.**
 * 트랜잭션은 되감으므로 데이터는 안 남는다.
 *
 * 왜 이 모양인가: `where` 를 붙이면 그 조건을 계산하려고 **조회 정책이 같이 걸린다.**
 * 그러면 갱신·삭제 정책을 통째로 열어 놔도 조회 정책이 대신 막아서 검사가 초록불이 된다 —
 * 실제로 그랬다(2026-09-08 변이 검증에서 `n4-notifications-update-open` 이 빠져나갔다).
 * 조건도 `returning` 도 없는 문장은 조회 정책을 거치지 않아, 갱신·삭제 정책 **혼자**
 * 무엇을 막고 있는지가 드러난다. 앱을 거치지 않는 이 경로가 INV-Z5 가 말하는 우회다.
 */
async function affectedRowsAs(uid: string, sql: string): Promise<number> {
  const c = await rawClient();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    const r = await c.query(sql);
    await c.query("rollback");
    return r.rowCount ?? 0;
  } finally {
    await c.end();
  }
}

/** 알림 표에 지금 몇 행이 있나. 위 판정에 "이빨"이 있는지 보이려고 같이 센다. */
async function totalNotifications(): Promise<number> {
  const { count, error } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`알림 수 조회 실패: ${error.message}`);
  return count ?? 0;
}

/** 그 사람 앞으로 온 알림을 관리 연결로 읽는다 — "실제로 무엇이 만들어졌나"를 보는 자리. */
async function notificationsOf(userId: string) {
  const { data, error } = await admin
    .from("notifications")
    .select("id, type, title, reference_type, reference_id, read_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`알림 조회 실패: ${error.message}`);
  return data ?? [];
}

beforeAll(async () => {
  host = await createUser("n-host");
  applicant = await createUser("n-applicant");
  rejected = await createUser("n-rejected");
  kicked = await createUser("n-kicked");
  stranger = await createUser("n-stranger");

  studyId = await createStudy(host.id, { max_participants: 5, title: "알림 검사용 스터디" });
}, 60_000);

afterAll(async () => {
  await cleanupCreatedUsers();
});

// ─────────────────────────────────────────────────────────────────────────
// INV-N3 — 받는 사람은 사건의 상대방이다
//
// 이 블록이 먼저 오는 이유는 순서가 아니라 **준비물**이다. 아래 블록들이 판정하는 알림
// 행은 여기서 실제 참가 사건으로 만들어진 것이고, 직접 넣은 행이 아니다.
// ─────────────────────────────────────────────────────────────────────────
describe("INV-N3: 알림은 사건의 상대방에게 간다", () => {
  it("INV-N3 (S3d): 스터디를 만들 때 호스트 자신이 accepted 로 들어와도 알림이 생기지 않는다", async () => {
    // **전제를 먼저 잰다.** 스터디 생성 트리거가 호스트를 accepted 참여자로 안 넣게 되면
    // 아래 단언은 아무것도 안 하면서 초록불이고, 건너뛰는 갈래는 어디서도 안 돌게 된다.
    const { data: 호스트행 } = await admin
      .from("participants")
      .select("status")
      .eq("study_id", studyId)
      .eq("user_id", host.id)
      .single();
    expect(호스트행?.status).toBe("accepted");

    expect(await notificationsOf(host.id)).toEqual([]);
  });

  it("INV-N3 (S3): 신청이 들어오면 알림은 호스트에게 가고 신청자에게는 안 간다", async () => {
    await apply(studyId, applicant.id);

    const forHost = await notificationsOf(host.id);
    expect(forHost).toHaveLength(1);
    expect(forHost[0].type).toBe("participation_requested");
    expect(forHost[0].title).toBe("알림 검사용 스터디");
    expect(forHost[0].reference_type).toBe("study");
    expect(forHost[0].reference_id).toBe(studyId);

    expect(await notificationsOf(applicant.id)).toEqual([]);
  });

  it("INV-N3 (S3b): 수락하면 알림은 신청자에게 가고 호스트에게는 안 간다", async () => {
    // **호스트 자신의 연결로 수락한다.** 관리 연결로 하면 접근 정책을 우회하므로
    // 트리거도 정책 아래에서 한 번도 안 돈다 (2026-09-08 test-auditor).
    const { error } = await host.client
      .from("participants")
      .update({ status: "accepted" })
      .eq("study_id", studyId)
      .eq("user_id", applicant.id);
    expect(error).toBeNull();

    const forApplicant = await notificationsOf(applicant.id);
    expect(forApplicant).toHaveLength(1);
    expect(forApplicant[0].type).toBe("participation_accepted");

    // 호스트에게는 신청 알림 하나뿐인 채로 남는다
    expect(await notificationsOf(host.id)).toHaveLength(1);
  });

  it("INV-N3 (S3b): 거절도 그 사람에게 간다 — 거절당한 사실은 그 사람과 호스트 사이의 일이다", async () => {
    await apply(studyId, rejected.id);
    const { error } = await host.client
      .from("participants")
      .update({ status: "rejected" })
      .eq("study_id", studyId)
      .eq("user_id", rejected.id);
    expect(error).toBeNull();

    const forRejected = await notificationsOf(rejected.id);
    expect(forRejected.map((n) => n.type)).toEqual(["participation_rejected"]);
  });

  it("INV-N3 (S3b): 강퇴도 그 사람에게 간다 — 호스트에게 「내보내졌습니다」가 쌓이면 안 된다", async () => {
    await acceptedMember(studyId, kicked.id);
    const 호스트것 = (await notificationsOf(host.id)).length;

    const { error } = await host.client
      .from("participants")
      .update({ status: "kicked" })
      .eq("study_id", studyId)
      .eq("user_id", kicked.id);
    expect(error).toBeNull();

    expect((await notificationsOf(kicked.id)).map((n) => n.type)).toEqual([
      "participation_accepted",
      "participation_kicked",
    ]);
    // 강퇴는 호스트가 한 일이므로 호스트에게는 새 알림이 없다
    expect(await notificationsOf(host.id)).toHaveLength(호스트것);
  });

  it("INV-N3 (S3c): 멤버가 스스로 나가면 알림은 호스트에게 간다", async () => {
    // 앞의 검사들이 호스트 앞으로 신청 알림을 여럿 만들어 두었으므로, 목록 전체가 아니라
    // **이 사건이 더한 것**을 본다. 전체로 비교하면 앞 검사를 하나 추가할 때마다 여기가 깨진다.
    const before = await notificationsOf(host.id);
    const { error } = await admin
      .from("participants")
      .update({ status: "withdrawn" })
      .eq("study_id", studyId)
      .eq("user_id", applicant.id);
    expect(error).toBeNull();

    const added = (await notificationsOf(host.id)).slice(before.length);
    expect(added.map((n) => n.type)).toEqual(["participation_withdrawn"]);

    // 나간 사람 자신에게는 아무것도 안 더해진다
    expect((await notificationsOf(applicant.id)).map((n) => n.type)).toEqual([
      "participation_accepted",
    ]);
  });

  it("INV-N3 (S3e): 호스트가 자기 스터디에서 스스로 나가면 알림이 안 생긴다", async () => {
    const before = (await notificationsOf(host.id)).length;
    const { error } = await admin
      .from("participants")
      .update({ status: "withdrawn" })
      .eq("study_id", studyId)
      .eq("user_id", host.id);
    expect(error).toBeNull();

    // 자기에게 자기 소식이 가지 않는다
    expect(await notificationsOf(host.id)).toHaveLength(before);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// INV-N1 — 받는 사람 본인에게만 보인다
// ─────────────────────────────────────────────────────────────────────────
describe("INV-N1: 알림은 받는 사람만 본다", () => {
  it("INV-N1 (S1b, 반대 절반): 본인은 자기 알림을 읽는다", async () => {
    const { data, error } = await applicant.client
      .from("notifications")
      .select("id, type")
      .order("created_at");
    expect(error).toBeNull();
    expect(data?.map((n) => n.type)).toEqual(["participation_accepted"]);
  });

  it("INV-N1 (S1): 그 스터디의 호스트여도 남의 알림은 못 읽는다", async () => {
    const mine = await notificationsOf(applicant.id);
    expect(mine.length).toBeGreaterThan(0);

    const { data, error } = await host.client
      .from("notifications")
      .select("id")
      .eq("id", mine[0].id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("INV-N1 (S1): 아무 관계 없는 로그인 사용자도 못 읽는다", async () => {
    const { data, error } = await stranger.client.from("notifications").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("INV-N1 (S1c): 비로그인은 알림 표에서 아무것도 못 읽는다", async () => {
    const { data, error } = await anonClient().from("notifications").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// INV-N2 — 사람은 알림을 만들 수 없다
// ─────────────────────────────────────────────────────────────────────────
describe("INV-N2: 알림은 사건에서만 생긴다", () => {
  it("INV-N2 (S2): 로그인한 사람은 자기 앞으로도 알림을 못 넣는다", async () => {
    const { error } = await applicant.client.from("notifications").insert({
      user_id: applicant.id,
      type: "participation_accepted",
      title: "내가 지어낸 스터디",
    });
    expect(error).not.toBeNull();
  });

  it("INV-N2 (S2b): 남 앞으로도 못 넣는다", async () => {
    const { error } = await stranger.client.from("notifications").insert({
      user_id: host.id,
      type: "participation_requested",
      title: "내가 지어낸 스터디",
    });
    expect(error).not.toBeNull();
  });

  it("INV-N2 (S2c, 반대 절반): 참가 신청은 알림 행을 실제로 만든다", async () => {
    // 이 절반이 없으면 삽입이 통째로 죽은 상태(= 알림이 영영 안 생긴다)도 위 둘로 초록불이다.
    //
    // **그 사람의 공개 키 연결로 넣는다.** 관리 연결로 넣으면 접근 정책을 우회하므로
    // 트리거가 한 번도 정책 아래에서 안 돌고, `security definer` 를 지워도 전부 초록불이
    // 된다 — 그 상태의 제품은 **참가 신청이 아예 안 된다**(트리거가 42501 로 실패하면서
    // 참여자 삽입까지 롤백된다). 2026-09-08 test-auditor.
    const before = (await notificationsOf(host.id)).length;

    const { error } = await stranger.client
      .from("participants")
      .insert({ study_id: studyId, user_id: stranger.id });
    expect(error).toBeNull();

    expect((await notificationsOf(host.id)).length).toBe(before + 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// INV-N4 — 읽음 처리와 삭제는 자기 것만
// ─────────────────────────────────────────────────────────────────────────
describe("INV-N4: 읽음 처리와 삭제는 자기 알림만 대상이다", () => {
  it("INV-N4 (S4): 남의 알림은 읽음으로 못 바꾼다", async () => {
    const theirs = (await notificationsOf(host.id))[0];
    const { error } = await applicant.client
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", theirs.id);
    expect(error).toBeNull(); // 정책은 거부가 아니라 "보이지 않음"으로 막는다

    const after = (await notificationsOf(host.id)).find((n) => n.id === theirs.id);
    expect(after?.read_at).toBeNull();
  });

  it("INV-N4 (S4b): 남의 알림은 못 지운다", async () => {
    const theirs = (await notificationsOf(host.id))[0];
    const { error } = await applicant.client.from("notifications").delete().eq("id", theirs.id);
    expect(error).toBeNull();

    expect((await notificationsOf(host.id)).some((n) => n.id === theirs.id)).toBe(true);
  });

  it("INV-N4 (S4d): 「전체 읽음」은 자기 알림 밖으로 나가지 않는다", async () => {
    // 조건에 사람을 안 적는다 — 앱이 실제로 보내는 모양 그대로다(주인은 접근 정책이다).
    const { error } = await applicant.client
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    expect(error).toBeNull();

    expect((await notificationsOf(applicant.id)).every((n) => n.read_at !== null)).toBe(true);
    expect((await notificationsOf(host.id)).every((n) => n.read_at === null)).toBe(true);
  });

  it("INV-N4 (S4): 조건 없이 날린 갱신도 남의 알림은 읽음으로 못 바꾼다", async () => {
    const total = await totalNotifications();
    const mine = (await notificationsOf(applicant.id)).length;
    expect(total).toBeGreaterThan(mine); // 남의 알림이 실제로 있는 상태에서 잰 값이다

    const changed = await affectedRowsAs(
      applicant.id,
      "update public.notifications set read_at = now()",
    );
    expect(changed).toBe(mine);
  });

  it("INV-N4 (S4b): 조건 없이 날린 삭제도 남의 알림은 못 지운다", async () => {
    const total = await totalNotifications();
    const mine = (await notificationsOf(applicant.id)).length;
    expect(total).toBeGreaterThan(mine);

    const removed = await affectedRowsAs(applicant.id, "delete from public.notifications");
    expect(removed).toBe(mine);
  });

  it("INV-N4 (S4c, 반대 절반): 자기 알림은 읽음 처리도 삭제도 된다", async () => {
    const mine = (await notificationsOf(rejected.id))[0];

    const { error: uErr } = await rejected.client
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", mine.id);
    expect(uErr).toBeNull();
    expect((await notificationsOf(rejected.id))[0].read_at).not.toBeNull();

    const { error: dErr } = await rejected.client
      .from("notifications")
      .delete()
      .eq("id", mine.id);
    expect(dErr).toBeNull();
    expect(await notificationsOf(rejected.id)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// INV-N5 — 만들어진 알림의 내용은 바뀌지 않는다
// ─────────────────────────────────────────────────────────────────────────
describe("INV-N5: 갱신으로 바뀔 수 있는 열은 read_at 뿐이다", () => {
  it("INV-N5 (S5): 자기 알림이라도 종류를 못 바꾼다", async () => {
    const mine = (await notificationsOf(applicant.id))[0];
    const { error } = await applicant.client
      .from("notifications")
      .update({ type: "participation_accepted" })
      .eq("id", mine.id);
    expect(error).not.toBeNull();
  });

  it("INV-N5 (S5b): 제목과 참조도 못 바꾼다", async () => {
    const mine = (await notificationsOf(applicant.id))[0];

    const { error: tErr } = await applicant.client
      .from("notifications")
      .update({ title: "내가 지어낸 제목" })
      .eq("id", mine.id);
    expect(tErr).not.toBeNull();

    const { error: rErr } = await applicant.client
      .from("notifications")
      .update({ reference_id: studyId })
      .eq("id", mine.id);
    expect(rErr).not.toBeNull();

    // 실제로 값이 그대로인지까지 본다 — 오류를 냈다는 것과 안 바뀌었다는 것은 다르다
    expect((await notificationsOf(applicant.id))[0].title).toBe("알림 검사용 스터디");
  });

  it("INV-N5 (S5c, 반대 절반): read_at 만 채우는 갱신은 성공한다", async () => {
    const mine = (await notificationsOf(applicant.id))[0];
    const { error: clearErr } = await admin
      .from("notifications")
      .update({ read_at: null })
      .eq("id", mine.id);
    expect(clearErr).toBeNull();

    const { error } = await applicant.client
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", mine.id);
    expect(error).toBeNull();
    expect((await notificationsOf(applicant.id))[0].read_at).not.toBeNull();
  });
});
