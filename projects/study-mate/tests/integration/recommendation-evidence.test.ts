import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appliedTitlesQuery,
  likedTitlesQuery,
  profileEvidenceQuery,
} from "@/features/recommend-studies/api/evidence-query";
import { titlesOf } from "@/features/recommend-studies/api/read-evidence";
import {
  accept,
  admin,
  apply,
  anonClient,
  cleanupCreatedUsers,
  createStudy,
  createUser,
  type TestUser,
} from "./helpers";

// 스펙: docs/specs/ai-assist.md — INV-G2
//
// **여기서 붙드는 것은 「추천이 근거를 읽을 때 정책이 판정한다」다.**
// 앱의 조회 함수(`readEvidence`)는 요청 맥락(`cookies()`)에 묶여 있어 여기서 못 부른다.
// 그래서 **그 함수가 실제로 쓰는 질의 함수**를 같이 부른다 — 검사가 질의를 손으로
// 조립하면, 조회 코드가 다른 질의를 쓰게 되어도 검사는 초록불이다.
//
// 연결은 **로그인한 공개 키**다. 그 키는 브라우저에도 들어가는 값이라, 이 연결로 할 수
// 있는 일이 곧 "아무나 할 수 있는 일"이다. 정책을 우회하는 키를 앱이 쓰기 시작하면
// 이 검사가 보는 것과 앱이 보는 것이 갈라진다 — 그래서 마지막 검사가 그 갈라짐을 잰다.

let alice: TestUser;
let bob: TestUser;
let studyId: string;
let postTitle: string;

/** 밥이 호스트가 아닌 스터디. 「호스트에게도 안 보이는 것이 있다」를 보이는 데 쓴다 */
const SECRET_STUDY = "캐럴의 비밀 스터디";

beforeAll(async () => {
  alice = await createUser("alice");
  bob = await createUser("bob");
  const carol = await createUser("carol");

  // 밥이 스터디를 열고 모집글을 쓴다. 앨리스가 그 글에 좋아요를 누르고 신청한다.
  studyId = await createStudy(bob.id, { title: "밥의 알고리즘 스터디" });
  postTitle = "밥의 알고리즘 모집글";
  const { error } = await admin
    .from("posts")
    .insert({ author_id: bob.id, study_id: studyId, title: postTitle, content: "본문" });
  if (error) throw new Error(`모집글 생성 실패: ${error.message}`);

  const { data: post } = await admin.from("posts").select("id").eq("study_id", studyId).single();
  await alice.client.from("likes").insert({ post_id: post?.id, user_id: alice.id });
  await apply(studyId, alice.id);
  await accept(studyId, alice.id);

  // 밥이 모르는 세 번째 스터디. 앨리스가 여기에도 신청한다.
  const carolStudy = await createStudy(carol.id, { title: SECRET_STUDY });
  await apply(carolStudy, alice.id);

  await admin
    .from("profiles")
    .update({ interest_category: "it", region: "seoul" })
    .eq("id", alice.id);
}, 60_000);

afterAll(async () => {
  await cleanupCreatedUsers();
});

describe("INV-G2: 추천이 근거를 읽는 연결은 요청자의 세션이다", () => {
  it("INV-G2: 본인의 근거 셋이 읽힌다 — 우회 키 없이도 다 나온다", async () => {
    const [profile, likes, participants] = await Promise.all([
      profileEvidenceQuery(alice.client, alice.id),
      likedTitlesQuery(alice.client, alice.id),
      appliedTitlesQuery(alice.client, alice.id),
    ]);

    expect(profile.data?.interest_category).toBe("it");
    expect(profile.data?.region).toBe("seoul");
    expect(titlesOf(likes.data, "post")).toContain(postTitle);
    expect(titlesOf(participants.data, "study")).toContain("밥의 알고리즘 스터디");
  });

  it("INV-G2 (실패경로): 남의 신청 이력은 안 읽힌다", async () => {
    // 밥이 앨리스의 신청 이력을 물어본다. 밥은 자기 스터디의 호스트지만 **앨리스의 id 로**
    // 묻는 것은 앨리스가 신청한 다른 스터디까지 달라는 것이다.
    const asBob = await appliedTitlesQuery(bob.client, alice.id);
    expect(titlesOf(asBob.data, "study")).not.toContain(SECRET_STUDY);
  });

  it("INV-G2 (실패경로): 로그인하지 않은 연결에는 남의 신청 이력이 안 보인다", async () => {
    const asAnon = await appliedTitlesQuery(anonClient(), alice.id);
    expect(titlesOf(asAnon.data, "study")).toEqual([]);
  });

  it("INV-G2: 정책을 우회하는 키로는 같은 질의가 남의 것까지 읽는다 — 그래서 그 키를 안 쓴다", async () => {
    // **이 검사가 방벽의 대조군이다.** 위 두 검사가 「안 보인다」를 말하는데, 그것이
    // 「정책이 막았다」인지 「원래 행이 없다」인지는 겉이 같다. 우회 키로 같은 질의를
    // 돌려서 행이 실제로 있다는 것을 보인다 — 앱이 그 키를 쓰기 시작하면 위 두 검사가
    // 보는 것과 앱이 보는 것이 갈라진다는 뜻이다.
    const bypassed = await appliedTitlesQuery(admin, alice.id);
    expect(titlesOf(bypassed.data, "study")).toContain(SECRET_STUDY);
  });
});
