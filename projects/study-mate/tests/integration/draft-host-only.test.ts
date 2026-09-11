import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hostedStudyForDraftQuery } from "@/features/create-post/api/draft-query";
import { admin, anonClient, cleanupCreatedUsers, createStudy, createUser, type TestUser } from "./helpers";

// 스펙: docs/specs/ai-assist.md — INV-G8
//
// **초안의 프롬프트에 들어가는 글은 요청한 본인이 쓴 것뿐이다.**
//
// 데이터베이스 정책은 모집글을 **저장할 때** 호스트를 판정한다(`0014`). 초안은 그보다
// 앞이라, 남의 스터디 id 를 실어 보내면 저장은 실패하지만 **그 전에 남의 스터디 설명이
// 프롬프트를 지나 초안으로 돌아온다.** 거부되는 것은 쓰기지 읽기가 아니다.
//
// 그래서 초안 경로는 자기 자리에서 호스트를 본다. 그 판정이 이 질의의 `host_id` 조건이고,
// 여기서 그것을 실제 데이터베이스에 붙여 확인한다.

let owner: TestUser;
let stranger: TestUser;
let studyId: string;

const DESCRIPTION = "남에게 보이면 안 되는 스터디 설명";

beforeAll(async () => {
  owner = await createUser("owner");
  stranger = await createUser("stranger");
  studyId = await createStudy(owner.id, {
    title: "주인의 스터디",
    description: DESCRIPTION,
  });
}, 60_000);

afterAll(async () => {
  await cleanupCreatedUsers();
});

describe("INV-G8: 초안의 근거 스터디는 요청자가 호스트인 것뿐이다", () => {
  it("INV-G8: 호스트 본인은 읽는다", async () => {
    const { data } = await hostedStudyForDraftQuery(owner.client, studyId, owner.id);
    expect(data?.description).toBe(DESCRIPTION);
  });

  it("INV-G8 (실패경로): 남이 그 id 로 물으면 아무것도 안 온다", async () => {
    // **이 사람은 그 스터디를 볼 수는 있다**(`studies_read` 는 공개다). 못 하는 것은
    // 「그것을 근거로 초안을 만드는 것」이고, 그 판정이 이 질의 안에 있다.
    const { data } = await hostedStudyForDraftQuery(stranger.client, studyId, stranger.id);
    expect(data).toBeNull();
  });

  // ── 아래 둘은 「막힌다」가 아니라 **어디가 막고 어디가 안 막는지**를 적어 둔 것이다 ──
  //
  // 스터디 조회는 공개다(`studies_read` 는 `using (true)`). 그래서 `host_id` 조건은
  // **정책이 아니라 필터**이고, 그 자리에 아무 id 나 넣으면 그 사람의 스터디가 그대로 온다.
  // 처음에 이 검사를 「안 온다」로 썼다가 빨간불을 보고 알았다.
  //
  // **그러면 INV-G8 을 무엇이 지키나.** 그 id 가 어디서 오는가다 — `api/draft-post.ts` 는
  // `currentUser()` 가 확인한 세션의 id 만 넣고, 화면이 보낸 값은 `studyId` 하나뿐이다.
  // 아래 두 검사는 **그 한 줄이 유일한 방벽이라는 사실**을 눈에 보이게 남긴다.

  it("INV-G8: host_id 조건은 인가가 아니다 — 남의 id 를 넣으면 남의 스터디가 온다", async () => {
    const { data } = await hostedStudyForDraftQuery(stranger.client, studyId, owner.id);
    expect(data?.description).toBe(DESCRIPTION);
  });

  it("INV-G8: 로그인하지 않은 연결도 마찬가지다 — 막는 것은 정책이 아니라 id 의 출처다", async () => {
    const { data } = await hostedStudyForDraftQuery(anonClient(), studyId, owner.id);
    expect(data?.description).toBe(DESCRIPTION);
  });

  it("INV-G8 (대조군): 그 설명은 실제로 존재한다 — 「안 온다」가 「원래 없다」가 아니다", async () => {
    const { data } = await admin.from("studies").select("description").eq("id", studyId).single();
    expect(data?.description).toBe(DESCRIPTION);
  });

  it("INV-G8 (실패경로): 지워진 스터디는 호스트에게도 안 온다", async () => {
    const gone = await createStudy(owner.id, { title: "지워진 스터디" });
    await admin.from("studies").update({ deleted_at: new Date().toISOString() }).eq("id", gone);
    const { data } = await hostedStudyForDraftQuery(owner.client, gone, owner.id);
    expect(data).toBeNull();
  });
});
