// 근거: docs/design/design-rules.md 「남이 쓴 글자와 제품이 쓴 글자」 ·
//       supabase/migrations/0020_study_title_length.sql
//
// 앱의 `TITLE_MAX` 는 폼과 서버 액션을 지나는 경로만 막는다. 이 검사가 보는 것은
// **그 경로를 안 지나는 쓰기**다 — `host.client` 는 공개 키로 로그인한 연결이고,
// 그 키는 브라우저 번들에도 들어가는 값이라 이 연결로 할 수 있는 일이 곧
// "아무나 할 수 있는 일"이다.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TITLE_MAX } from "@/entities/study/model/limits";
import { admin, cleanupCreatedUsers, createStudy, createUser, type TestUser } from "./helpers";

let host: TestUser;
let studyId: string;

const 스터디 = (title: string) => ({
  host_id: host.id,
  title,
  description: "본문",
  category_id: "it",
  region_code: "seoul",
  meeting_mode: "online",
  max_participants: 3,
});

beforeAll(async () => {
  host = await createUser("t-max-host");
  studyId = await createStudy(host.id);
}, 60_000);

afterAll(async () => {
  await cleanupCreatedUsers();
});

describe("스터디 제목의 모양은 데이터베이스가 지킨다", () => {
  // **경계를 양쪽에서 민다.** 「길면 거부」만 보면 상한을 61 로 늘리는 변이가 통과하고,
  // 「60자는 통과」만 보면 제약을 통째로 빼는 변이가 통과한다.
  //
  // 앱의 상수로 미는 이유: 스키마와 `TITLE_MAX` 가 갈라지면 폼은 받아 놓고 데이터베이스가
  // 거부하거나(저장을 누른 뒤에야 막힌다), 반대로 스키마만 넓어져 이 검사가 앱과 무관한
  // 숫자를 재게 된다. 두 값이 같을 때만 아래 둘이 동시에 성립한다.
  it(`${TITLE_MAX}자는 들어가고 ${TITLE_MAX + 1}자는 안 들어간다`, async () => {
    const at = await admin.from("studies").insert(스터디("가".repeat(TITLE_MAX))).select("id").single();
    expect(at.error, `${TITLE_MAX}자가 거부됐다 — 스키마의 상한이 앱보다 좁다`).toBeNull();
    if (at.data) await admin.from("studies").delete().eq("id", at.data.id);

    const over = await admin.from("studies").insert(스터디("가".repeat(TITLE_MAX + 1)));
    expect(over.error, "상한을 넘긴 제목이 그대로 들어갔다").not.toBeNull();
    expect(over.error!.message).toMatch(/studies_title_length/);
  });

  it("빈 제목은 안 들어간다", async () => {
    const r = await admin.from("studies").insert(스터디(""));
    expect(r.error, "빈 제목이 그대로 들어갔다").not.toBeNull();
    expect(r.error!.message).toMatch(/studies_title_length/);
  });

  // **길이만 보면 이 갈래가 빠져나간다.** `char_length('   ')` 는 3이라 통과하고,
  // 화면에서는 HTML 이 공백을 접어 「」에 새 참가 신청이 왔습니다가 된다.
  // 폼은 `formText` 가 다듬어서 못 만들지만, 이 제약이 막으려는 것이 폼 밖 경로다.
  it("공백뿐인 제목도 안 들어간다", async () => {
    for (const 공백 of ["   ", "\n", "\t \n"]) {
      const r = await admin.from("studies").insert(스터디(공백));
      expect(r.error, `공백뿐인 제목(${JSON.stringify(공백)})이 그대로 들어갔다`).not.toBeNull();
      expect(r.error!.message).toMatch(/studies_title_(length|no_control)/);
    }
  });

  // 0015 가 사용자 이름에 세운 규칙과 같은 것이다. 길이 안에 들어와도 제어문자는 막힌다.
  it("제어문자가 든 제목은 안 들어간다", async () => {
    // 소스에 진짜 제어문자를 안 적는다 — diff 에도 grep 에도 안 보인다
    const 벨 = String.fromCharCode(7);
    const r = await admin.from("studies").insert(스터디(`토익${벨}900`));
    expect(r.error, "제어문자가 든 제목이 그대로 들어갔다").not.toBeNull();
    expect(r.error!.message).toMatch(/studies_title_no_control/);
  });

  // **이것이 실제로 열려 있던 경로다.** `title` 은 열 단위 갱신 권한 목록에 있어서(0002)
  // 호스트는 폼을 안 지나고 공개 키로 직접 제목을 바꿀 수 있고, 그 값은 그 다음 참가
  // 사건에서 트리거를 타고 **다른 사람의 알림 행**으로 복사된다.
  it("폼을 안 지나는 갱신도 같은 상한을 받는다", async () => {
    // **`select` 를 붙여 바뀐 행 수를 본다.** 접근 정책에 막힌 갱신은 오류가 아니라
    // 0행이라, `error === null` 만으로는 「허용됐다」가 안 나온다 (2026-09-09 test-auditor).
    const ok = await host.client
      .from("studies")
      .update({ title: "가".repeat(TITLE_MAX) })
      .eq("id", studyId)
      .select("id");
    expect(ok.error, `호스트가 ${TITLE_MAX}자로 못 바꾼다 — 상한이 앱보다 좁다`).toBeNull();
    expect(ok.data?.length, "갱신이 0행이다 — 제약이 아니라 정책에 막혔다").toBe(1);

    // 갱신 경로도 스스로 경계를 민다. 넉넉히 넘긴 값으로 재면 삽입과 갱신에 서로 다른
    // 상한이 걸리는 변이를 못 본다.
    const over = await host.client
      .from("studies")
      .update({ title: "가".repeat(TITLE_MAX + 1) })
      .eq("id", studyId);
    expect(over.error, "공개 키로 붙은 호스트가 상한을 넘겼다").not.toBeNull();
    expect(over.error!.message).toMatch(/studies_title_length/);

    // **거부가 값을 안 바꿨는지까지 본다.** 오류만 확인하면 「거부하면서 저장은 됐다」를 못 본다.
    const { data } = await admin.from("studies").select("title").eq("id", studyId).single();
    expect(data!.title).toBe("가".repeat(TITLE_MAX));
  });

  // **알림 행은 사건 시점의 사본이라 원본 제약이 안 덮는다.** 트리거가 넣는 값은 이미
  // 좁아진 원본에서 오므로 새로 막히는 것은 없지만, 값이 읽히는 자리에도 같은 규칙이
  // 서 있어야 「지금 이후로」라는 단서 없이 상한을 말할 수 있다.
  it("알림에 실린 제목도 같은 상한을 받는다", async () => {
    const r = await admin.from("notifications").insert({
      user_id: host.id,
      type: "participation_requested",
      title: "가".repeat(TITLE_MAX + 1),
      reference_id: studyId,
    });
    expect(r.error, "상한을 넘긴 제목이 알림 행에 그대로 들어갔다").not.toBeNull();
    expect(r.error!.message).toMatch(/notifications_title_length/);
  });
});
