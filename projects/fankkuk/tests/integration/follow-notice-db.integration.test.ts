import { afterAll, describe, expect, it } from "vitest";
import { anonClient, psql, SEED, signedInClient } from "./helpers";

// 요청 fankkuk-db-2: 팔로우 저장은 로그인한 팬 자기 것만, 공지는 누구나 읽는다.
// 팔로우를 바꾸는 시험은 달토끼 계정으로만 한다 — 별빛의 시드 팔로우는 다른 시험(메인·팔로우 목록)이 쓴다.

const MOMO_CREATOR_ID = "00000000-0000-4000-b000-000000000002";
const UNVERIFIED_ID = "00000000-0000-4000-b000-0000000000f1";

async function followIds(loginId: string): Promise<string[]> {
  const c = await signedInClient(loginId);
  const r = await c.rpc("my_follows");
  expect(r.error).toBeNull();
  return (r.data as { creator_id: string }[]).map((f) => f.creator_id);
}

afterAll(() => {
  psql(
    `delete from public.follows where fan_id = '${SEED.otherFanId}' and creator_id in ('${SEED.haruCreatorId}', '${MOMO_CREATOR_ID}')`,
  );
  psql(`delete from public.creators where id = '${UNVERIFIED_ID}'`);
});

describe("팔로우 저장은 로그인한 팬 자기 것만 바꾼다", () => {
  it("달토끼가 하루를 팔로우하면 달토끼 목록에만 생기고, 끊으면 사라진다", async () => {
    const daltokki = await signedInClient("daltokki_fan");
    const byeolbitBefore = await followIds("byeolbit_fan");

    expect(
      (
        await daltokki.rpc("set_follow", {
          p_creator_id: SEED.haruCreatorId,
          p_following: true,
        })
      ).error,
    ).toBeNull();
    expect(await followIds("daltokki_fan")).toContain(SEED.haruCreatorId);
    expect(await followIds("byeolbit_fan")).toEqual(byeolbitBefore);

    expect(
      (
        await daltokki.rpc("set_follow", {
          p_creator_id: SEED.haruCreatorId,
          p_following: false,
        })
      ).error,
    ).toBeNull();
    expect(await followIds("daltokki_fan")).not.toContain(SEED.haruCreatorId);
    expect(await followIds("byeolbit_fan")).toEqual(byeolbitBefore);
  });

  it("달토끼가 끊어도 별빛의 같은 크리에이터 팔로우는 그대로다", async () => {
    expect(await followIds("byeolbit_fan")).toContain(MOMO_CREATOR_ID);
    const daltokki = await signedInClient("daltokki_fan");
    expect(
      (
        await daltokki.rpc("set_follow", {
          p_creator_id: MOMO_CREATOR_ID,
          p_following: false,
        })
      ).error,
    ).toBeNull();
    expect(await followIds("byeolbit_fan")).toContain(MOMO_CREATOR_ID);
  });

  it("같은 팔로우를 두 번 보내도 한 줄이다", async () => {
    const daltokki = await signedInClient("daltokki_fan");
    for (let i = 0; i < 2; i += 1) {
      expect(
        (
          await daltokki.rpc("set_follow", {
            p_creator_id: MOMO_CREATOR_ID,
            p_following: true,
          })
        ).error,
      ).toBeNull();
    }
    expect(
      psql(
        `select count(*) from public.follows where fan_id = '${SEED.otherFanId}' and creator_id = '${MOMO_CREATOR_ID}'`,
      ),
    ).toBe("1");
    await daltokki.rpc("set_follow", {
      p_creator_id: MOMO_CREATOR_ID,
      p_following: false,
    });
  });

  it("함수에 사람 칸을 끼워 넣을 수 없다 — 인자가 둘뿐이라 다른 팬 id 를 넣으면 함수를 못 찾는다", async () => {
    const daltokki = await signedInClient("daltokki_fan");
    const r = await daltokki.rpc("set_follow", {
      p_creator_id: SEED.haruCreatorId,
      p_following: true,
      p_fan_id: SEED.fanId,
    });
    expect(r.error).not.toBeNull();
    expect(await followIds("daltokki_fan")).not.toContain(SEED.haruCreatorId);
  });

  it("로그인하지 않았으면 거부", async () => {
    const r = await anonClient().rpc("set_follow", {
      p_creator_id: SEED.haruCreatorId,
      p_following: true,
    });
    expect(r.error?.code).toBe("42501");
  });

  it("크리에이터 계정은 팔로우하지 못한다", async () => {
    const haru = await signedInClient("haru_creator");
    const r = await haru.rpc("set_follow", {
      p_creator_id: MOMO_CREATOR_ID,
      p_following: true,
    });
    expect(r.error?.code).toBe("42501");
    expect(
      psql(
        `select count(*) from public.follows where fan_id = '${SEED.creatorProfileId}'`,
      ),
    ).toBe("0");
  });

  it("본인 확인 전 크리에이터와 없는 크리에이터는 팔로우할 수 없다", async () => {
    psql(
      `insert into public.creators (id, slug, name, channel, identity_verified) values ('${UNVERIFIED_ID}', 'unverified-test', '미인증', '유튜브', false) on conflict (id) do nothing`,
    );
    const daltokki = await signedInClient("daltokki_fan");
    expect(
      (
        await daltokki.rpc("set_follow", {
          p_creator_id: UNVERIFIED_ID,
          p_following: true,
        })
      ).error?.code,
    ).toBe("P0002");
    expect(
      (
        await daltokki.rpc("set_follow", {
          p_creator_id: "00000000-0000-4000-b000-0000000000ff",
          p_following: true,
        })
      ).error?.code,
    ).toBe("P0002");
    expect(await followIds("daltokki_fan")).not.toContain(UNVERIFIED_ID);
  });

  it("팔로우 표는 직접 쓰지 못한다 — 함수로만", async () => {
    const daltokki = await signedInClient("daltokki_fan");
    const r = await daltokki
      .from("follows")
      .insert({ fan_id: SEED.otherFanId, creator_id: SEED.haruCreatorId });
    expect(r.error).not.toBeNull();
    const d = await daltokki.from("follows").delete().eq("fan_id", SEED.fanId);
    expect(d.error).not.toBeNull();
  });
});

describe("공지는 누구나 읽는다", () => {
  it("로그인하지 않아도 읽고, 고정 글이 먼저 그다음 최신순이다", async () => {
    const r = await anonClient().rpc("list_notices");
    expect(r.error).toBeNull();
    const rows = r.data as {
      slug: string;
      pinned: boolean;
      published_on: string;
    }[];
    expect(rows.length).toBeGreaterThanOrEqual(11);
    expect(rows.slice(0, 2).map((n) => n.slug)).toEqual(["n-open", "n-size"]);
    const rest = rows.filter((n) => !n.pinned).map((n) => n.published_on);
    expect(rest).toEqual(rest.toSorted().toReversed());
    expect(rows.find((n) => n.slug === "n-price")?.published_on).toBe(
      "2026-09-30",
    );
  });

  it("게시 시각이 아직 오지 않은 공지는 보이지 않는다", async () => {
    // 시험이 중간에 끊겨 지우지 못해도 화면에 뜨지 않게: 100년 뒤·고정 아님
    psql(
      `insert into public.notices (slug, title, published_at, pinned, body) values ('n-future-test', '미래 공지', now() + interval '100 years', false, '[]') on conflict (slug) do nothing`,
    );
    try {
      const rows = (await anonClient().rpc("list_notices")).data as {
        slug: string;
      }[];
      expect(rows.map((n) => n.slug)).not.toContain("n-future-test");
    } finally {
      psql(`delete from public.notices where slug = 'n-future-test'`);
    }
  });

  it("공지 표는 직접 읽지 못한다 — 함수로만", async () => {
    const r = await anonClient().from("notices").select("slug");
    expect(r.error).not.toBeNull();
  });
});
