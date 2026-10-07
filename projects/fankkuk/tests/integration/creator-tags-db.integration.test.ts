import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anonClient, holdRowLock, psql, signedInClient } from "./helpers";
import { CV, createCvAccounts, dropCvAccounts, resetCv } from "./creator-verification-helpers";

// 크리에이터 태그 (docs/specs/creator-tags.md INV-T1~T6, S1~S6).
// 시드 크리에이터의 태그를 바꾸지 않으려고 본인 확인 시험 계정(cvt_*)을 쓴다. 시드 크리에이터는 「바뀌지 않았는가」만 읽는다.
// 시험이 만든 선택지는 처음 선택지 아홉 개가 아닌 이름이라 정리 때 지운다. 처음 선택지의 숨김·순서도 정리 때 처음대로 되돌린다.

const HARU = CV.haru; // 「하루시험」
const MOMO = CV.summer; // 「여름밤」 — 시나리오의 모모 자리
const BYEOL = CV.ggul; // 「꿀단지」 — 시나리오의 별이 자리
const SEED_MOMO_CREATOR_ID = "00000000-0000-4000-b000-000000000002";
const STAFF_UID = "00000000-0000-4000-a000-000000000022"; // 시드 fankkuk_staff(운영자) — psql 세션에서 운영자로 부를 때
const INITIAL = ["SOOP", "치지직", "유튜브", "알플레이", "인스타그램", "X", "스레드", "틱톡", "버추얼"] as const;
const CV_IDS = Object.values(CV).map((a) => `'${a.creatorId}'`).join(", ");

/** 처음 선택지 아홉 개의 id — 시험이 이름을 고쳐도 id 로 되돌린다. 시드 크리에이터가 고른 선택지라 지우면 안 된다. */
let initialIds: string[] = [];

function resetTags(): void {
  const keep = initialIds.map((id) => `'${id}'`).join(", ");
  psql(
    [
      "begin;",
      `delete from public.creator_tags where creator_id in (${CV_IDS});`,
      `delete from public.creator_custom_tags where creator_id in (${CV_IDS});`,
      // 시험이 만든 선택지만 — 시드 크리에이터는 처음 선택지만 고른다
      `delete from public.creator_tags where option_id not in (${keep});`,
      `delete from public.creator_tag_options where id not in (${keep});`,
      ...INITIAL.map((n, i) => `update public.creator_tag_options set name = '${n}', hidden = false, position = ${i + 1} where id = '${initialIds[i]}';`),
      "commit;",
    ].join(" "),
  );
}

function verify(creatorId: string, slug: string): void {
  psql(
    `begin; set local session_replication_role = replica; update public.creators set identity_verified = true, searchable = true, channel = 'https://www.youtube.com/@${slug}' where id = '${creatorId}'; commit;`,
  );
}

function optionId(name: string): string {
  const id = psql(`select id from public.creator_tag_options where name = '${name}'`);
  if (!id) throw new Error(`선택지 없음: ${name}`);
  return id;
}

/** 크리에이터의 태그 — 선택지 이름(선택지 순서) + 「직접:<말>」. */
function tagsOf(creatorId: string): string[] {
  const options = psql(
    `select coalesce(string_agg(o.name, '|' order by o.position), '') from public.creator_tags t join public.creator_tag_options o on o.id = t.option_id where t.creator_id = '${creatorId}'`,
  );
  const custom = psql(`select coalesce((select tag from public.creator_custom_tags where creator_id = '${creatorId}'), '')`);
  return [...(options ? options.split("|") : []), ...(custom ? [`직접:${custom}`] : [])];
}

function optionNames(): string[] {
  return psql(`select string_agg(name || (case when hidden then '(숨김)' else '' end), '|' order by position, created_at) from public.creator_tag_options`).split("|");
}

async function saveTags(login: string, args: Record<string, unknown>) {
  return (await signedInClient(login)).rpc("update_my_creator_tags", args);
}

async function operator(fn: string, args: Record<string, unknown>, login = "fankkuk_staff") {
  return (await signedInClient(login)).rpc(fn, args);
}

beforeAll(() => {
  initialIds = INITIAL.map((n) => {
    const id = psql(`select id from public.creator_tag_options where name = '${n}'`);
    if (!id) throw new Error(`처음 선택지가 없다: ${n} — 지난 실행이 이름을 바꾼 채 끝났으면 손으로 되돌린다`);
    return id;
  });
  createCvAccounts();
  resetCv();
  resetTags();
});
beforeEach(() => {
  resetCv();
  resetTags();
});
afterAll(() => {
  resetTags();
  dropCvAccounts();
});

describe("INV-T1: 선택지는 운영자만 바꾼다", () => {
  it("INV-T1: 처음 선택지는 SOOP · 치지직 · 유튜브 · 알플레이 · 인스타그램 · X · 스레드 · 틱톡 · 버추얼 순서다", async () => {
    const r = await anonClient().rpc("creator_tag_options");
    expect(r.error).toBeNull();
    expect((r.data as { name: string }[]).map((o) => o.name)).toEqual([...INITIAL]);
  });

  it("INV-T1 S1: 운영자(직원)가 「팬더TV」를 추가하면 목록 끝에 생긴다", async () => {
    const r = await operator("admin_add_creator_tag_option", { p_name: " 팬더TV " });
    expect(r.error).toBeNull();
    expect(optionNames()).toEqual([...INITIAL, "팬더TV"]);
  });

  it("INV-T1: 이름은 겹치지 않는다 — 앞뒤 공백을 빼고 영문 대소문자를 무시해 같으면 추가·이름 고치기 모두 거부", async () => {
    expect((await operator("admin_add_creator_tag_option", { p_name: "soop" })).error?.code).toBe("55000");
    expect((await operator("admin_add_creator_tag_option", { p_name: "  x " })).error?.code).toBe("55000");
    expect((await operator("admin_rename_creator_tag_option", { p_id: optionId("틱톡"), p_name: "Soop" })).error?.code).toBe("55000");
    expect(optionNames()).toEqual([...INITIAL]);
  });

  it("INV-T1 (실패경로): 보이지 않는 글자가 든 이름(「팝콘​TV」)은 추가·이름 고치기 모두 22023, 목록 그대로", async () => {
    const zeroWidth = "팝콘​TV";
    expect((await operator("admin_add_creator_tag_option", { p_name: zeroWidth })).error?.code).toBe("22023");
    expect((await operator("admin_rename_creator_tag_option", { p_id: optionId("틱톡"), p_name: zeroWidth })).error?.code).toBe("22023");
    expect(optionNames()).toEqual([...INITIAL]);
  });

  it("INV-T1: 운영자가 이름 고치기 · 숨기기 · 다시 보이기 · 순서 바꾸기를 한다", async () => {
    expect((await operator("admin_rename_creator_tag_option", { p_id: optionId("X"), p_name: "X(트위터)" })).error).toBeNull();
    expect((await operator("admin_set_creator_tag_option_hidden", { p_id: optionId("틱톡"), p_hidden: true })).error).toBeNull();
    expect((await operator("admin_move_creator_tag_option", { p_id: optionId("치지직"), p_up: true })).error).toBeNull();
    expect((await operator("admin_move_creator_tag_option", { p_id: optionId("버추얼"), p_up: false })).error).toBeNull(); // 맨 끝은 그대로
    expect(optionNames()).toEqual(["치지직", "SOOP", "유튜브", "알플레이", "인스타그램", "X(트위터)", "스레드", "틱톡(숨김)", "버추얼"]);
    const pub = (await anonClient().rpc("creator_tag_options")).data as { name: string }[];
    expect(pub.map((o) => o.name)).toEqual(["치지직", "SOOP", "유튜브", "알플레이", "인스타그램", "X(트위터)", "스레드", "버추얼"]);
    expect((await operator("admin_set_creator_tag_option_hidden", { p_id: optionId("틱톡"), p_hidden: false })).error).toBeNull();
    expect(optionNames()).toContain("틱톡");
  });

  it("INV-T1: 운영자 목록은 숨긴 선택지도 보이고 고른 크리에이터 수가 붙는다", async () => {
    expect((await saveTags(HARU.login, { p_option_ids: [optionId("치지직")], p_custom_tag: null })).error).toBeNull();
    await operator("admin_set_creator_tag_option_hidden", { p_id: optionId("틱톡"), p_hidden: true });
    const r = await operator("admin_creator_tag_options", {});
    expect(r.error).toBeNull();
    const rows = r.data as { name: string; hidden: boolean; creator_count: number }[];
    expect(rows.map((o) => o.name)).toEqual([...INITIAL]);
    expect(rows.find((o) => o.name === "틱톡")?.hidden).toBe(true);
    expect(rows.find((o) => o.name === "치지직")?.creator_count).toBeGreaterThanOrEqual(1);
  });

  it("INV-T1 S1b (실패경로): 크리에이터·팬·로그인 안 한 사람이 추가·이름 고치기·숨기기·순서 바꾸기를 하면 거부, 목록 그대로", async () => {
    const before = optionNames();
    const calls: [string, Record<string, unknown>][] = [
      ["admin_add_creator_tag_option", { p_name: "팬더TV" }],
      ["admin_rename_creator_tag_option", { p_id: optionId("X"), p_name: "트위터" }],
      ["admin_set_creator_tag_option_hidden", { p_id: optionId("버추얼"), p_hidden: true }],
      ["admin_move_creator_tag_option", { p_id: optionId("버추얼"), p_up: true }],
    ];
    for (const login of [HARU.login, "byeolbit_fan"]) {
      const c = await signedInClient(login);
      for (const [fn, args] of calls) expect([fn, login, (await c.rpc(fn, args)).error?.code]).toEqual([fn, login, "42501"]);
    }
    for (const [fn, args] of calls) expect((await anonClient().rpc(fn, args)).error).not.toBeNull();
    expect(optionNames()).toEqual(before);
    // 운영자 목록 읽기도 운영자만
    for (const login of [HARU.login, "byeolbit_fan"]) {
      const r = await (await signedInClient(login)).rpc("admin_creator_tag_options");
      expect(r.data ?? []).toEqual([]);
    }
  });

  it("INV-T1 S1b (실패경로): 로그인한 사용자는 선택지 표·태그 표를 직접 고치거나 읽지 못한다", async () => {
    const me = await signedInClient(HARU.login);
    await me.from("creator_tag_options").insert({ name: "직접넣기", position: 99 });
    await me.from("creator_tag_options").update({ hidden: true }).eq("name", "SOOP");
    await me.from("creator_tags").insert({ creator_id: SEED_MOMO_CREATOR_ID, option_id: optionId("틱톡") });
    await me.from("creator_custom_tags").insert({ creator_id: HARU.creatorId, tag: "광고" });
    expect(optionNames()).toEqual([...INITIAL]);
    expect(tagsOf(HARU.creatorId)).toEqual([]);
    expect(psql(`select count(*) from public.creator_tags where creator_id = '${SEED_MOMO_CREATOR_ID}' and option_id = '${optionId("틱톡")}'`)).toBe("0");
    for (const table of ["creator_tag_options", "creator_tags", "creator_custom_tags"]) {
      const r = await anonClient().from(table).select("*");
      expect([table, r.error !== null || (r.data ?? []).length === 0]).toEqual([table, true]);
    }
  });
});

describe("INV-T2: 태그 고치기는 로그인한 크리에이터 자기 줄만", () => {
  it("INV-T2 S2: 하루가 태그를 「치지직·버추얼」로 바꾸면 하루의 태그만 바뀐다", async () => {
    const seedMomo = tagsOf(SEED_MOMO_CREATOR_ID);
    expect((await saveTags(MOMO.login, { p_option_ids: [optionId("유튜브")], p_custom_tag: null })).error).toBeNull();
    const r = await saveTags(HARU.login, { p_option_ids: [optionId("버추얼"), optionId("치지직")], p_custom_tag: "" });
    expect(r.error).toBeNull();
    expect(tagsOf(HARU.creatorId)).toEqual(["치지직", "버추얼"]);
    expect(tagsOf(MOMO.creatorId)).toEqual(["유튜브"]);
    expect(tagsOf(SEED_MOMO_CREATOR_ID)).toEqual(seedMomo);
  });

  it("INV-T2 S2b (실패경로): 팬·운영자가 부르면 거부, 로그인 안 하면 부를 수 없다", async () => {
    expect((await saveTags("byeolbit_fan", { p_option_ids: [optionId("치지직")], p_custom_tag: null })).error?.code).toBe("42501");
    expect((await saveTags("fankkuk_staff", { p_option_ids: [optionId("치지직")], p_custom_tag: null })).error?.code).toBe("42501");
    expect((await anonClient().rpc("update_my_creator_tags", { p_option_ids: [optionId("치지직")], p_custom_tag: null })).error).not.toBeNull();
  });

  it("INV-T2 S2b (실패경로): 다른 크리에이터의 ID·계정 ID 를 실어 보내면 받을 칸이 없어 거부되고 아무도 안 바뀐다", async () => {
    const seedMomo = tagsOf(SEED_MOMO_CREATOR_ID);
    for (const extra of [{ p_creator_id: SEED_MOMO_CREATOR_ID }, { p_account_id: MOMO.id }]) {
      const r = await saveTags(HARU.login, { p_option_ids: [optionId("틱톡")], p_custom_tag: null, ...extra });
      expect(r.error).not.toBeNull();
    }
    expect(tagsOf(SEED_MOMO_CREATOR_ID)).toEqual(seedMomo);
    expect(tagsOf(HARU.creatorId)).toEqual([]);
  });

  it("INV-T2: 내 설정 읽기는 내 선택지와 직접 입력을 돌려준다", async () => {
    await saveTags(HARU.login, { p_option_ids: [optionId("치지직")], p_custom_tag: "팝콘TV" });
    const r = await (await signedInClient(HARU.login)).rpc("my_creator_settings");
    expect(r.error).toBeNull();
    const row = (r.data as { tag_ids: string[]; custom_tag: string | null }[])[0];
    expect(row).toMatchObject({ tag_ids: [optionId("치지직")], custom_tag: "팝콘TV" });
  });
});

describe("INV-T3: 태그는 합쳐 1~5개 — 선택지 0~5 + 직접 입력 0~1", () => {
  it("INV-T3 S3: 선택지 4개 + 직접 입력 「팝콘TV」 → 5개 저장", async () => {
    const ids = ["SOOP", "치지직", "유튜브", "버추얼"].map(optionId);
    expect((await saveTags(HARU.login, { p_option_ids: ids, p_custom_tag: " 팝콘TV " })).error).toBeNull();
    expect(tagsOf(HARU.creatorId)).toEqual(["SOOP", "치지직", "유튜브", "버추얼", "직접:팝콘TV"]);
  });

  it("INV-T3: 직접 입력 하나만으로도 저장되고, 경계 안 — 직접 입력 20자", async () => {
    expect((await saveTags(HARU.login, { p_option_ids: [], p_custom_tag: "가".repeat(20) })).error).toBeNull();
    expect(tagsOf(HARU.creatorId)).toEqual([`직접:${"가".repeat(20)}`]);
  });

  it("INV-T3 S3b (실패경로): 선택지 5 + 직접 1 / 0개 / 같은 선택지 두 번 / 숨긴 선택지 / 직접 입력 21자 / 없는 선택지 / 선택지 6개 → 거부, 치지직 + 직접 입력 팝콘TV 그대로", async () => {
    expect((await saveTags(HARU.login, { p_option_ids: [optionId("치지직")], p_custom_tag: "팝콘TV" })).error).toBeNull();
    expect(tagsOf(HARU.creatorId)).toEqual(["치지직", "직접:팝콘TV"]);
    await operator("admin_set_creator_tag_option_hidden", { p_id: optionId("틱톡"), p_hidden: true });
    const five = ["SOOP", "치지직", "유튜브", "알플레이", "버추얼"].map(optionId);
    const cases: Record<string, unknown>[] = [
      { p_option_ids: five, p_custom_tag: "팝콘TV" },
      { p_option_ids: [], p_custom_tag: null },
      { p_option_ids: [], p_custom_tag: "   " },
      { p_option_ids: [optionId("치지직"), optionId("치지직")], p_custom_tag: null },
      { p_option_ids: [optionId("틱톡")], p_custom_tag: null },
      { p_option_ids: [optionId("치지직")], p_custom_tag: "가".repeat(21) },
      { p_option_ids: [optionId("치지직")], p_custom_tag: "팝콘​TV" },
      { p_option_ids: ["00000000-0000-4000-9000-000000000000"], p_custom_tag: null },
      { p_option_ids: [...five, optionId("X")], p_custom_tag: null },
      { p_option_ids: null, p_custom_tag: "팝콘TV" },
    ];
    for (const args of cases) {
      const r = await saveTags(HARU.login, args);
      expect([args, r.error?.code]).toEqual([args, "22023"]);
    }
    expect(tagsOf(HARU.creatorId)).toEqual(["치지직", "직접:팝콘TV"]);
  });

  it("INV-T3 S3c: 선택지 5개(유튜브 포함) + 직접 입력 「유튜브」 → 겹친 것은 하나로 세어 성공, 5개 저장", async () => {
    const five = ["SOOP", "치지직", "유튜브", "알플레이", "버추얼"].map(optionId);
    expect((await saveTags(HARU.login, { p_option_ids: five, p_custom_tag: " 유튜브 " })).error).toBeNull();
    expect(tagsOf(HARU.creatorId)).toEqual(["SOOP", "치지직", "유튜브", "알플레이", "버추얼"]);
  });

  it("INV-T3: 숨긴 선택지와 같은 말을 직접 입력하면 직접 입력으로 남고 공개 목록에는 나오지 않는다 — 틱톡 숨김 + {치지직, 「틱톡」}", async () => {
    verify(HARU.creatorId, "cvt-haru");
    expect((await operator("admin_set_creator_tag_option_hidden", { p_id: optionId("틱톡"), p_hidden: true })).error).toBeNull();
    try {
      expect((await saveTags(HARU.login, { p_option_ids: [optionId("치지직")], p_custom_tag: "틱톡" })).error).toBeNull();
      expect(tagsOf(HARU.creatorId)).toEqual(["치지직", "직접:틱톡"]);
      const row = ((await anonClient().rpc("find_creators")).data as { id: string; tags: string[] }[]).find((x) => x.id === HARU.creatorId);
      expect(row?.tags).toEqual(["치지직"]);
      expect(JSON.stringify(row)).not.toContain("틱톡");
    } finally {
      psql(`update public.creator_tag_options set hidden = false where name = '틱톡'`);
    }
  });

  it("INV-T3·T5 동시성: 운영자가 「버추얼」을 숨기는 처리가 끝나기 전에 크리에이터가 버추얼을 넣어 저장하면 — 숨김이 끝난 뒤 판정해 거부(22023)되거나 버추얼이 붙지 않는다", async () => {
    const virtual = optionId("버추얼");
    expect((await saveTags(HARU.login, { p_option_ids: [optionId("치지직")], p_custom_tag: null })).error).toBeNull();
    try {
      // 다른 연결에서 운영자로 숨기고 2초 동안 처리를 열어 둔다
      const hold = await holdRowLock(
        `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${STAFF_UID}","role":"authenticated"}', true); select public.admin_set_creator_tag_option_hidden('${virtual}', true)`,
        2,
      );
      // 숨김 함수가 선택지 표를 잠근 것을 확인한 뒤에 저장을 보낸다 — 앞뒤로 비껴 가서 통과하지 않게
      for (let i = 0; i < 100; i++) {
        const n = psql(
          `select count(*) from pg_locks l join pg_class c on c.oid = l.relation where c.relname = 'creator_tag_options' and l.mode = 'ShareRowExclusiveLock' and l.granted`,
        );
        if (n !== "0") break;
        await new Promise((r) => setTimeout(r, 50));
      }
      const r = await saveTags(HARU.login, { p_option_ids: [optionId("치지직"), virtual], p_custom_tag: null });
      await hold.released;
      expect(psql(`select hidden from public.creator_tag_options where id = '${virtual}'`)).toBe("t");
      if (r.error) expect(r.error.code).toBe("22023");
      expect(tagsOf(HARU.creatorId)).not.toContain("버추얼");
    } finally {
      psql(`update public.creator_tag_options set hidden = false where id = '${virtual}'`);
    }
  });

  it("INV-T3 S3c: 직접 입력 「 유튜브 」·「x」 는 그 선택지를 고른 것으로 저장되고 직접 입력은 남지 않는다", async () => {
    expect((await saveTags(HARU.login, { p_option_ids: [], p_custom_tag: " 유튜브 " })).error).toBeNull();
    expect(tagsOf(HARU.creatorId)).toEqual(["유튜브"]);
    expect((await saveTags(HARU.login, { p_option_ids: [optionId("치지직")], p_custom_tag: "x" })).error).toBeNull();
    expect(tagsOf(HARU.creatorId)).toEqual(["치지직", "X"]);
  });

  it("INV-T3: 선택지 표는 같은 크리에이터에게 같은 선택지를 두 번 붙일 수 없다(DB 제약)", () => {
    psql(`insert into public.creator_tags (creator_id, option_id) values ('${HARU.creatorId}', '${optionId("SOOP")}')`);
    expect(() => psql(`insert into public.creator_tags (creator_id, option_id) values ('${HARU.creatorId}', '${optionId("SOOP")}')`)).toThrow();
  });
});

describe("INV-T4: 공개 화면에는 숨기지 않은 선택지만", () => {
  type PublicRow = { id: string; tags: string[] } & Record<string, unknown>;
  async function publicRow(fn: "find_creators" | "list_creators", creatorId: string): Promise<PublicRow | undefined> {
    const r = await anonClient().rpc(fn);
    expect(r.error).toBeNull();
    return (r.data as PublicRow[]).find((x) => x.id === creatorId);
  }

  it("INV-T4 S4: 하루 = 치지직 + 직접 입력 「팝콘TV」 → 찾기·크리에이터 목록에 「치지직」만, 「팝콘TV」는 어떤 칸에도 없다", async () => {
    verify(HARU.creatorId, "cvt-haru");
    expect((await saveTags(HARU.login, { p_option_ids: [optionId("치지직")], p_custom_tag: "팝콘TV" })).error).toBeNull();
    for (const fn of ["find_creators", "list_creators"] as const) {
      const row = await publicRow(fn, HARU.creatorId);
      expect(row?.tags).toEqual(["치지직"]);
      expect(JSON.stringify(row)).not.toContain("팝콘");
      expect(row).not.toHaveProperty("category");
      expect(row).not.toHaveProperty("custom_tag");
    }
    // 공개 선택지 목록에도 없다
    const options = (await anonClient().rpc("creator_tag_options")).data as { name: string }[];
    expect(options.map((o) => o.name)).not.toContain("팝콘TV");
  });

  it("INV-T4 (실패경로): 직접 입력은 다른 크리에이터·팬이 읽는 어떤 길로도 나오지 않는다", async () => {
    await saveTags(HARU.login, { p_option_ids: [optionId("치지직")], p_custom_tag: "팝콘TV" });
    for (const login of ["byeolbit_fan", MOMO.login]) {
      const c = await signedInClient(login);
      const mine = (await c.rpc("my_creator_settings")).data as { custom_tag?: string | null }[] | null;
      expect(JSON.stringify(mine ?? [])).not.toContain("팝콘");
      const custom = await c.rpc("admin_custom_creator_tags");
      expect(custom.data ?? []).toEqual([]);
    }
  });

  it("INV-T4 S4b: 크리에이터 순서 그대로, 선택지 순서대로 태그가 온다(크리에이터가 고른 순서가 아니다)", async () => {
    verify(HARU.creatorId, "cvt-haru");
    await saveTags(HARU.login, { p_option_ids: [optionId("버추얼"), optionId("SOOP")], p_custom_tag: null });
    expect((await publicRow("find_creators", HARU.creatorId))?.tags).toEqual(["SOOP", "버추얼"]);
  });
});

describe("INV-T5: 직접 입력을 선택지로 올리기 — 한 처리 안에서", () => {
  it("INV-T5: 운영자 직접 입력 목록은 같은 말을 묶어 인원수를 센다", async () => {
    await saveTags(HARU.login, { p_option_ids: [optionId("치지직")], p_custom_tag: "팝콘TV" });
    await saveTags(MOMO.login, { p_option_ids: [], p_custom_tag: "팝콘TV" });
    await saveTags(BYEOL.login, { p_option_ids: [], p_custom_tag: " 팝콘tv" });
    const r = await operator("admin_custom_creator_tags", {});
    expect(r.error).toBeNull();
    const row = (r.data as { tag: string; creator_count: number }[]).find((x) => x.tag.toLowerCase() === "팝콘tv");
    expect(row?.creator_count).toBe(3);
  });

  it("INV-T5 S5: 하루·모모 「팝콘TV」, 별이 「팝콘tv」 → 셋 다 선택지 팝콘TV, 직접 입력 없음, 칩 목록에 팝콘TV", async () => {
    verify(HARU.creatorId, "cvt-haru");
    await saveTags(HARU.login, { p_option_ids: [optionId("치지직")], p_custom_tag: "팝콘TV" });
    await saveTags(MOMO.login, { p_option_ids: [], p_custom_tag: "팝콘TV" });
    await saveTags(BYEOL.login, { p_option_ids: [optionId("유튜브")], p_custom_tag: "팝콘tv" });
    const r = await operator("admin_promote_custom_creator_tag", { p_tag: "팝콘TV" });
    expect(r.error).toBeNull();
    expect(optionNames()).toEqual([...INITIAL, "팝콘TV"]);
    expect(tagsOf(HARU.creatorId)).toEqual(["치지직", "팝콘TV"]);
    expect(tagsOf(MOMO.creatorId)).toEqual(["팝콘TV"]);
    expect(tagsOf(BYEOL.creatorId)).toEqual(["유튜브", "팝콘TV"]);
    expect(psql(`select count(*) from public.creator_custom_tags where creator_id in (${CV_IDS})`)).toBe("0");
    const options = (await anonClient().rpc("creator_tag_options")).data as { name: string }[];
    expect(options.map((o) => o.name)).toContain("팝콘TV");
    const found = (await anonClient().rpc("find_creators")).data as { id: string; tags: string[] }[];
    expect(found.find((x) => x.id === HARU.creatorId)?.tags).toEqual(["치지직", "팝콘TV"]);
  });

  it("INV-T5: 이미 있는 선택지면 그것을 쓰고(숨겨져 있으면 다시 보이게), 이미 가진 크리에이터는 직접 입력만 지운다 — 태그 수가 늘지 않는다", async () => {
    await operator("admin_add_creator_tag_option", { p_name: "팝콘TV" });
    const popcorn = optionId("팝콘TV");
    // 하루는 선택지 팝콘TV 를 가진 채로, 숨긴 동안 같은 말을 직접 입력했다
    await saveTags(HARU.login, { p_option_ids: ["SOOP", "치지직", "유튜브", "알플레이"].map(optionId).concat(popcorn), p_custom_tag: null });
    await operator("admin_set_creator_tag_option_hidden", { p_id: popcorn, p_hidden: true });
    psql(`insert into public.creator_custom_tags (creator_id, tag) values ('${HARU.creatorId}', '팝콘tv')`);
    await saveTags(MOMO.login, { p_option_ids: ["SOOP", "치지직", "유튜브", "알플레이"].map(optionId), p_custom_tag: "팝콘TV" });

    const r = await operator("admin_promote_custom_creator_tag", { p_tag: "팝콘tv" });
    expect(r.error).toBeNull();
    expect(r.data).toBe(popcorn);
    expect(optionNames().filter((n) => n.startsWith("팝콘"))).toEqual(["팝콘TV"]); // 하나뿐, 숨김 풀림
    expect(tagsOf(HARU.creatorId)).toEqual(["SOOP", "치지직", "유튜브", "알플레이", "팝콘TV"]);
    expect(tagsOf(MOMO.creatorId)).toEqual(["SOOP", "치지직", "유튜브", "알플레이", "팝콘TV"]);
  });

  it("INV-T5 S5b (실패경로): 크리에이터·팬·로그인 안 한 사람이 올리기 함수를 부르면 거부, 아무도 안 바뀐다", async () => {
    await saveTags(HARU.login, { p_option_ids: [optionId("치지직")], p_custom_tag: "팝콘TV" });
    for (const login of [HARU.login, "byeolbit_fan"]) {
      expect((await (await signedInClient(login)).rpc("admin_promote_custom_creator_tag", { p_tag: "팝콘TV" })).error?.code).toBe("42501");
    }
    expect((await anonClient().rpc("admin_promote_custom_creator_tag", { p_tag: "팝콘TV" })).error).not.toBeNull();
    expect(optionNames()).toEqual([...INITIAL]);
    expect(tagsOf(HARU.creatorId)).toEqual(["치지직", "직접:팝콘TV"]);
  });

  it("INV-T5 (실패경로): 아무도 적지 않은 말은 올리지 않는다 — 선택지가 생기지 않는다", async () => {
    expect((await operator("admin_promote_custom_creator_tag", { p_tag: "없는말" })).error?.code).toBe("P0002");
    expect(optionNames()).toEqual([...INITIAL]);
  });

  it("INV-T5 (실패경로): 중간에 실패하면 아무것도 바뀌지 않는다 — 한 크리에이터 줄을 바꾸다 오류가 나면 선택지도 다른 크리에이터도 그대로", async () => {
    await saveTags(HARU.login, { p_option_ids: [optionId("치지직")], p_custom_tag: "팝콘TV" });
    await saveTags(MOMO.login, { p_option_ids: [], p_custom_tag: "팝콘TV" });
    // 모모 줄에 태그가 붙는 순간 오류를 내는 트리거를 잠깐 건다(로컬 DB)
    psql(`
      create or replace function public.test_fail_on_momo() returns trigger language plpgsql as $$
      begin if new.creator_id = '${MOMO.creatorId}' then raise exception 'test failure'; end if; return new; end $$;
      create trigger test_fail_on_momo before insert on public.creator_tags for each row execute function public.test_fail_on_momo();
    `);
    try {
      const r = await operator("admin_promote_custom_creator_tag", { p_tag: "팝콘TV" });
      expect(r.error).not.toBeNull();
    } finally {
      psql("drop trigger if exists test_fail_on_momo on public.creator_tags; drop function if exists public.test_fail_on_momo();");
    }
    expect(optionNames()).toEqual([...INITIAL]);
    expect(tagsOf(HARU.creatorId)).toEqual(["치지직", "직접:팝콘TV"]);
    expect(tagsOf(MOMO.creatorId)).toEqual(["직접:팝콘TV"]);
  });
});

describe("INV-T6: 숨겨도 고른 기록은 남는다", () => {
  it("INV-T6 S6: 하루 = 치지직·버추얼 → 버추얼 숨김 동안 카드에 치지직만, 다시 보이게 하면 치지직·버추얼", async () => {
    verify(HARU.creatorId, "cvt-haru");
    await saveTags(HARU.login, { p_option_ids: [optionId("치지직"), optionId("버추얼")], p_custom_tag: null });
    const virtual = optionId("버추얼");
    const tags = async () => ((await anonClient().rpc("find_creators")).data as { id: string; tags: string[] }[]).find((x) => x.id === HARU.creatorId)?.tags;

    expect((await operator("admin_set_creator_tag_option_hidden", { p_id: virtual, p_hidden: true })).error).toBeNull();
    expect(await tags()).toEqual(["치지직"]);
    expect(tagsOf(HARU.creatorId)).toEqual(["치지직", "버추얼"]); // 기록은 그대로
    const mine = ((await (await signedInClient(HARU.login)).rpc("my_creator_settings")).data as { tag_ids: string[] }[])[0];
    expect(mine?.tag_ids).toEqual([optionId("치지직")]); // 숨긴 선택지는 고를 수 없으니 설정 화면에도 고른 것으로 오지 않는다

    expect((await operator("admin_set_creator_tag_option_hidden", { p_id: virtual, p_hidden: false })).error).toBeNull();
    expect(await tags()).toEqual(["치지직", "버추얼"]);
    const again = ((await (await signedInClient(HARU.login)).rpc("my_creator_settings")).data as { tag_ids: string[] }[])[0];
    expect(again?.tag_ids).toEqual([optionId("치지직"), virtual]); // 다시 보이면 설정 화면에도 고른 것으로 돌아온다
  });

  it("INV-T6: 숨긴 동안 크리에이터가 태그를 고치면 숨긴 선택지는 빠진다 — 되돌려도 돌아오지 않는다", async () => {
    await saveTags(HARU.login, { p_option_ids: [optionId("치지직"), optionId("버추얼")], p_custom_tag: null });
    const virtual = optionId("버추얼");
    await operator("admin_set_creator_tag_option_hidden", { p_id: virtual, p_hidden: true });
    expect((await saveTags(HARU.login, { p_option_ids: [optionId("치지직"), optionId("SOOP")], p_custom_tag: null })).error).toBeNull();
    await operator("admin_set_creator_tag_option_hidden", { p_id: virtual, p_hidden: false });
    expect(tagsOf(HARU.creatorId)).toEqual(["SOOP", "치지직"]);
  });
});
