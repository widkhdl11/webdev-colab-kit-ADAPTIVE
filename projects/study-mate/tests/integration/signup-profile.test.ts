// 근거 스펙: docs/specs/auth-session.md (INV-A7)
//
// **여기서 확인하는 것은 앱이 아니라 데이터베이스다.** 프로필을 앱이 만들던 때는
// "가입 직후에 세션이 있다"에 기대고 있었고, 이메일 확인이 켜지면 그 전제가 깨져
// 프로필 없는 계정이 남았다(2026-09-05 실측: 세션 null · profiles insert 가 정책에 거부).
// 그래서 아래 검사들은 전부 **앱 코드를 한 줄도 지나지 않는 경로**로 계정을 만든다 —
// 그 경로에서도 프로필이 생겨야 이 불변식이 참이다.

import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, rawClient } from "./helpers";

/**
 * 이 파일이 만든 계정 장부. 만든 직후에 적는다 — 아래에서 던져도 지워진다.
 *
 * `helpers.ts` 의 장부는 `createUser` 만 채우는데 이 파일은 그것을 안 쓴다(계정을
 * 인증 API 와 원시 SQL 로 직접 만든다). 그래서 장부가 따로 있다.
 */
const made: string[] = [];

async function createAccount(meta: Record<string, unknown> | undefined) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `a7-${randomUUID().slice(0, 8)}@example.test`,
    password: randomUUID(),
    email_confirm: true,
    ...(meta ? { user_metadata: meta } : {}),
  });
  if (error || !data.user) throw new Error(`사용자 생성 실패: ${error?.message}`);
  made.push(data.user.id);
  return data.user.id;
}

async function usernameOf(id: string): Promise<string | null> {
  const { data } = await admin.from("profiles").select("username").eq("id", id).maybeSingle();
  return (data?.username as string | undefined) ?? null;
}

afterAll(async () => {
  if (made.length === 0) return;

  // **인증 API 로 지우지 않는다.** 아래 한 검사가 계정을 `auth.users` 에 직접 넣는데,
  // GoTrue 는 자기가 만들지 않은 그 행을 지워 주지 않는다(오류를 삼키면 조용히 남는다).
  // 남은 계정은 다음 실행의 판정을 바꾼다 — 변이 도구의 사용자 수 지문이 실제로 잡았다.
  //
  // **못 지운 것은 장부에 되돌린다.** 먼저 비우고 지우면, 실패했을 때 그 계정이 장부에서도
  // 사라져 아무도 다시 시도하지 못한다(`helpers.cleanupCreatedUsers` 와 같은 규약).
  const targets = made.splice(0);
  const c = await rawClient();
  try {
    const r = await c.query("delete from auth.users where id = any($1::uuid[])", [targets]);
    if (r.rowCount !== targets.length) {
      const left = await c.query("select id from auth.users where id = any($1::uuid[])", [targets]);
      made.push(...left.rows.map((x) => x.id as string));
      throw new Error(
        `계정 ${targets.length}개를 지우려 했는데 ${r.rowCount}개만 지워졌다 — 남은 것: ${made.join(", ")}`,
      );
    }
  } finally {
    await c.end();
  }
});

describe("INV-A7: 계정과 프로필은 함께 생긴다", () => {
  it("INV-A7 (S5): 세션 없이 만들어진 계정에도 프로필이 있다", async () => {
    // 관리자 API 로 만든 계정에는 세션이 없다 — 옛 코드가 깨지던 조건과 같다.
    const id = await createAccount({ username: "가입자" });
    expect(await usernameOf(id)).toBe("가입자");
  });

  it("INV-A7 (S5b): 프로필은 계정과 **같은 트랜잭션**에서 생긴다", async () => {
    // 강제 위치가 정말 데이터베이스인지를 여기서 가른다. 위 검사는 GoTrue 를 지나므로
    // "GoTrue 안 어딘가가 프로필을 만들어 주는 세상"에서도 통과한다.
    //
    // **커밋 전에 읽는다.** 자동 커밋으로 넣고 나중에 읽으면 「같은 트랜잭션에서 트리거가
    // 넣었다」와 「커밋 뒤에 다른 무언가가 빠르게 넣었다」가 구분되지 않는다.
    const c = await rawClient();
    const id = randomUUID();
    try {
      await c.query("begin");
      try {
        await c.query(
          `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                                   email_confirmed_at, created_at, updated_at,
                                   raw_app_meta_data, raw_user_meta_data)
           values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                   $2, '', now(), now(), now(), '{}'::jsonb, jsonb_build_object('username', $3::text))`,
          [id, `a7-raw-${id.slice(0, 8)}@example.test`, "직접삽입"],
        );
      } catch (e) {
        // GoTrue 스키마가 바뀌면 여기서 죽는데, 원문만 보면 INV-A7 이 깨진 것처럼 읽힌다.
        throw new Error(
          `auth.users 에 직접 넣지 못했다 — GoTrue 스키마가 바뀌었을 수 있다(INV-A7 위반이 아니다): ${
            (e as Error).message
          }`,
        );
      }

      const inTx = await c.query("select username from public.profiles where id = $1", [id]);
      expect(inTx.rowCount, "커밋 전에는 프로필이 없다 — 트리거가 아니라 나중에 만든다는 뜻").toBe(1);
      expect(inTx.rows[0].username).toBe("직접삽입");

      await c.query("rollback");

      // 되감으면 둘 다 사라져야 한다. 하나만 남으면 프로필을 만든 것이 이 트랜잭션 밖이다.
      const after = await c.query(
        `select (select count(*) from auth.users where id = $1) as users,
                (select count(*) from public.profiles where id = $1) as profiles`,
        [id],
      );
      expect(after.rows[0]).toEqual({ users: "0", profiles: "0" });
    } finally {
      await c.end();
    }
  });

  it("INV-A7 (S5c): 이름을 안 실어 보낸 가입도 프로필을 받는다", async () => {
    // 이름이 없으면 **거절하지 않고 지어 준다.** 거절하면 트리거의 예외가 계정 생성까지
    // 되돌려서, 이 불변식이 세우려는 것을 트리거 자신이 어기는 모양이 된다.
    const id = await createAccount(undefined);
    const name = await usernameOf(id);
    expect(name, "이름 없는 가입에 프로필이 안 생겼다").not.toBeNull();
    expect(name).toBe(`회원${id.slice(0, 8)}`);
  });

  it("INV-A7 (S5c): 빈 이름과 공백뿐인 이름도 가입을 막지 않는다", async () => {
    // **여기가 두 방향으로 깨진다.** 이름을 씻는 자리가 없으면
    //   · `""` 는 길이 0 이라 제약에 걸리고 → 트리거가 예외 → **가입 자체가 거절된다**
    //   · 전각 공백은 길이 1 이라 제약을 통과하고 → **빈 줄로 뜨는 사용자**가 생긴다
    // 기본 `btrim` 은 U+0020 만 자르므로 아래 셋 중 둘째만 걸러졌다.
    const blanks: [string, string][] = [
      ["빈 문자열", ""],
      ["보통 공백", "   "],
      ["전각 공백", "　　"],
    ];
    for (const [what, value] of blanks) {
      const id = await createAccount({ username: value });
      expect(await usernameOf(id), `${what}: 지어진 이름이 아니다`).toBe(`회원${id.slice(0, 8)}`);
    }
  });

  it("INV-A7 · INV-T1 · INV-T2: 보이지 않는 글자와 서식 문자가 든 이름도 가입을 막지 않는다", async () => {
    // **0022 가 세운 제약이 여기서 가입을 통째로 깰 수 있다.** 프로필은 계정 행이 들어오는
    // 그 트랜잭션에서 트리거가 만들므로, 이름이 제약에 걸리면 예외가 **계정 생성까지**
    // 되돌린다. 위 「빈 이름과 공백뿐인 이름」 검사가 지키는 것과 같은 규칙이고,
    // 0022 가 지우는 집합을 넓혔으니 씻는 쪽도 같이 넓어져야 한다.
    //
    // 이 검사가 없으면 **0022 를 올리는 것만으로 가입 경로에 구멍이 난다** — 유닛도
    // 통합도 전부 초록불인 채로.
    const 글자 = (cp: number) => String.fromCodePoint(cp);
    const 씻겨야 = [
      ["U+200B 폭 없는 공백만", 글자(0x200b)],
      ["U+2060 단어 이음만", 글자(0x2060)],
      ["U+180E 몽골 모음 구분만", 글자(0x180e)],
      ["U+200D ZWJ 만", 글자(0x200d)],
      ["섞인 보이지 않는 글자", 글자(0x3000) + 글자(0x200b) + 글자(0xfeff)],
    ] as const;
    for (const [what, value] of 씻겨야) {
      const id = await createAccount({ username: value });
      expect(await usernameOf(id), `${what}: 지어진 이름이 아니다`).toBe(`회원${id.slice(0, 8)}`);
    }

    // 서식 문자는 **지우고 나머지를 쓴다** — 통째로 버리면 이름이 사라진다.
    const 서식 = [
      ["RLO 섞임", 글자(0x202e) + "지원", "지원"],
      ["RLE 섞임", 글자(0x202b) + "하늘", "하늘"],
      ["LRM 섞임", "김" + 글자(0x200e) + "하늘", "김하늘"],
    ] as const;
    for (const [what, value, expected] of 서식) {
      const id = await createAccount({ username: value });
      expect(await usernameOf(id), what).toBe(expected);
    }

    // **자르고 나서 판정해야 한다.** 앞이 전부 폭 없는 글자면 20자로 자른 뒤에 보이는
    // 글자가 하나도 안 남는다 — 판정을 자르기 전에 하면 여기서 가입이 깨진다.
    const id = await createAccount({ username: 글자(0x200c).repeat(25) + "지원" });
    expect(await usernameOf(id), "자른 뒤에 보이는 글자가 없는 경우").toBe(`회원${id.slice(0, 8)}`);
  });

  it("INV-A7: 이름 길이 규칙은 앱이 아니라 데이터베이스가 지킨다", async () => {
    // 20자 하한이 회원가입 폼에만 있으면, 앱을 안 거친 가입이 그 규칙을 통째로 건너뛴다.
    const id = await createAccount({ username: "가".repeat(50) });
    expect(await usernameOf(id)).toBe("가".repeat(20));

    // **경계를 양쪽에서 민다.** 「너무 길면 거부」만 보면 상한을 21 로 늘리는 변이가 통과하고,
    // 「20자는 통과」만 보면 제약을 통째로 빼는 변이가 통과한다.
    const at20 = await admin.from("profiles").update({ username: "나".repeat(20) }).eq("id", id);
    expect(at20.error, "20자가 거부됐다").toBeNull();

    const at21 = await admin.from("profiles").update({ username: "나".repeat(21) }).eq("id", id);
    expect(at21.error, "21자 이름이 그대로 들어갔다").not.toBeNull();
    expect(at21.error!.message).toMatch(/profiles_username_length/);
  });

  it("INV-A7: 트리거는 profiles 의 필수 컬럼 집합에 묶여 있다", async () => {
    // 트리거는 `id, username` 둘만 넣는다. 기본값 없는 not null 컬럼이 하나 더 붙는 순간
    // 이 insert 가 실패하고 **모든 회원가입이 실패한다**(예외가 계정 생성까지 되돌린다).
    // 그 사실을 주석이 아니라 검사로 둔다 — 컬럼을 더하는 사람이 여기서 멈춘다.
    const c = await rawClient();
    try {
      const r = await c.query(
        `select a.attname
           from pg_attribute a
          where a.attrelid = 'public.profiles'::regclass
            and a.attnum > 0 and not a.attisdropped
            and a.attnotnull
            and not exists (select 1 from pg_attrdef d
                             where d.adrelid = a.attrelid and d.adnum = a.attnum)
          order by 1`,
      );
      expect(
        r.rows.map((x) => x.attname),
        "기본값 없는 필수 컬럼이 늘었다 — handle_new_user 도 같이 고쳐야 가입이 계속 된다",
      ).toEqual(["id", "username"]);
    } finally {
      await c.end();
    }
  });
});
