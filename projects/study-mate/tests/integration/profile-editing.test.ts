// 근거 스펙: docs/specs/profile-editing.md (INV-E1 ~ INV-E5)
//
// **여기서 쓰는 연결은 전부 공개 키다.** 그 키는 브라우저 번들에도 들어가는 값이라,
// 이 연결로 할 수 있는 일이 곧 "아무나 할 수 있는 일"이다. 서버 코드를 한 줄도 거치지 않는다.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  anonClient,
  cleanupCreatedUsers,
  createUser,
  rawClient,
  type TestUser,
} from "./helpers";

let me: TestUser;
let other: TestUser;

/** 1x1 PNG. 진짜 이미지 바이트라야 형식 검사를 통과하는지 볼 수 있다 */
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

function png(): Blob {
  return new Blob([PNG], { type: "image/png" });
}

/** 이 검사가 저장소에 남긴 것을 지운다 — 다음 실행이 「이미 있다」로 죽지 않게 */
async function wipeAvatars(userIds: readonly string[]): Promise<void> {
  for (const id of userIds) {
    const { data } = await admin.storage.from("avatars").list(id);
    const names = (data ?? []).map((f) => `${id}/${f.name}`);
    if (names.length > 0) await admin.storage.from("avatars").remove(names);
  }
}

beforeAll(async () => {
  me = await createUser("e-me");
  other = await createUser("e-other");
  await wipeAvatars([me.id, other.id]);
}, 60_000);

afterAll(async () => {
  // **계정 정리는 무슨 일이 있어도 돈다.** 준비물 만들기가 실패하면(변이가 가입 트리거를
  // 지우면 `createUser` 가 던진다) `me`·`other` 가 비어 있고, 그 상태에서 아바타 뒷정리가
  // 먼저 던지면 이 줄이 안 돌아 계정이 남는다. 남은 계정은 다음 변이의 판정을 오염시켜
  // **변이 전수가 통째로 멈춘다** — 2026-09-06 에 실제로 그렇게 멈췄다.
  const ids = [me?.id, other?.id].filter((id): id is string => typeof id === "string");
  try {
    await wipeAvatars(ids);
  } catch (cause) {
    console.warn("[test] 아바타 뒷정리 실패 — 계정 정리는 계속한다", cause);
  }
  await cleanupCreatedUsers();
});

describe("INV-E1: 프로필 행을 고칠 수 있는 것은 본인뿐이다", () => {
  it("INV-E1(실패경로, S1): 남의 프로필 행에 이름을 쓰면 아무 행도 안 바뀐다", async () => {
    const { data } = await other.client
      .from("profiles")
      .update({ username: "빼앗은이름" })
      .eq("id", me.id)
      .select("id");

    // 정책이 `using` 으로 대상 행을 감추므로 오류가 아니라 0행 갱신으로 끝난다.
    // 그래서 **오류 유무가 아니라 실제 값**을 본다 — 0행 갱신은 성공처럼 보인다.
    expect(data ?? []).toEqual([]);

    const { data: after } = await admin
      .from("profiles")
      .select("username")
      .eq("id", me.id)
      .single();
    expect(after?.username).toBe("e-me");
  });

  it("INV-E1(반대 절반, S2): 자기 프로필의 네 값을 고칠 수 있다", async () => {
    const { error } = await me.client
      .from("profiles")
      .update({
        username: "고친이름",
        bio: "소개를 적었다",
        region: "busan",
        interest_category: "design",
      })
      .eq("id", me.id);
    expect(error).toBeNull();

    const { data } = await admin
      .from("profiles")
      .select("username, bio, region, interest_category")
      .eq("id", me.id)
      .single();
    expect(data).toMatchObject({
      username: "고친이름",
      bio: "소개를 적었다",
      region: "busan",
      interest_category: "design",
    });
  });
});

describe("INV-E2: 프로필의 주인은 갱신으로 바뀌지 않는다", () => {
  it("INV-E2(실패경로, S3): 거부하는 것이 접근 정책이다 — 기본 키가 대신 잡아 주는 것이 아니다", async () => {
    // **준비물이 이 검사의 전부다.** 그냥 `other.id` 로 바꾸려 하면 그쪽에 이미 프로필
    // 행이 있어서, `with check` 를 통째로 지워도 기본 키 중복(23505)이 대신 막는다 —
    // 오류는 여전히 null 이 아니고 뒤의 단언도 다 통과한다. 그러면 이 검사는 스펙이
    // "정책을 손댈 때 `with check` 를 빼면 깨진다"고 못 박은 그 변이를 못 잡는다.
    //
    // 그래서 **프로필 행이 없는 계정**을 하나 만든다(계정은 남기고 행만 지운다).
    // 기본 키도 외래 키도 안 걸리므로 거부의 이유가 접근 정책 하나뿐이 된다.
    const 빈자리 = await createUser("e-empty");
    await admin.from("profiles").delete().eq("id", 빈자리.id);

    const { error } = await me.client.from("profiles").update({ id: 빈자리.id }).eq("id", me.id);

    expect(error).not.toBeNull();
    // 42501 = 접근 정책 거부. 23505(기본 키)·23503(외래 키)이면 다른 것이 잡은 것이다.
    expect(error?.code).toBe("42501");

    const { data } = await admin.from("profiles").select("id").eq("id", me.id).maybeSingle();
    expect(data?.id).toBe(me.id);
  });
});

describe("INV-E3: 아바타 파일은 자기 아이디 폴더 아래에만 올라간다", () => {
  it("INV-E3(경로, 실패경로 S4): 아직 비어 있는 남의 폴더도 차지할 수 없다", async () => {
    const { error } = await me.client.storage
      .from("avatars")
      .upload(`${other.id}/avatar.png`, png(), { contentType: "image/png", upsert: true });

    expect(error).not.toBeNull();

    // **행이 안 생겼는지도 본다.** 오류만 보면, 다른 이유로 실패하고 정책은 열려 있는
    // 상태와 구분되지 않는다.
    const { data } = await admin.storage.from("avatars").list(other.id);
    expect(data ?? []).toEqual([]);
  });

  it("INV-E3(반대 절반, S5): 자기 폴더에는 올라가고 덮어쓸 수 있다", async () => {
    const path = `${me.id}/avatar.png`;
    const first = await me.client.storage
      .from("avatars")
      .upload(path, png(), { contentType: "image/png", upsert: true });
    expect(first.error).toBeNull();

    // 덮어쓴 뒤 **내용이 실제로 바뀌었는지** 본다. 오류 없음만 보면, 덮어쓰기가 조용히
    // 아무 일도 안 하는 상태와 구분되지 않는다.
    const 다른바이트 = new Blob([new Uint8Array(64)], { type: "image/png" });
    const again = await me.client.storage
      .from("avatars")
      .upload(path, 다른바이트, { contentType: "image/png", upsert: true });
    expect(again.error).toBeNull();

    const { data: 받은것 } = await admin.storage.from("avatars").download(path);
    expect((await 받은것!.arrayBuffer()).byteLength).toBe(64);
  });

  it("INV-E3(주인): 경로는 내 것인데 남이 만든 행이면 못 고친다", async () => {
    // 관리 키로 **내 폴더에** 파일을 넣는다 — 경로는 내 것이고 주인만 내가 아니다.
    // 이 준비물이 없으면 `owner_id` 판정을 지워도 경로 조건이 대신 막아 초록불이 난다.
    const path = `${me.id}/by-admin.png`;
    const put = await admin.storage
      .from("avatars")
      .upload(path, png(), { contentType: "image/png", upsert: true });
    expect(put.error).toBeNull();

    const over = await me.client.storage
      .from("avatars")
      .upload(path, png(), { contentType: "image/png", upsert: true });
    expect(over.error).not.toBeNull();

    await me.client.storage.from("avatars").remove([path]);
    const { data: still } = await admin.storage.from("avatars").list(me.id);
    expect((still ?? []).map((f) => f.name)).toContain("by-admin.png");
  });

  it("INV-E3(경로): 주인은 나인데 경로가 남의 폴더면 못 고친다", async () => {
    // 저장소 API 로는 만들 수 없는 행이라(정책이 막는다) 데이터베이스에 직접 넣는다.
    // 이 준비물이 없으면 경로 판정을 지워도 `owner_id` 가 대신 막아 초록불이 난다.
    const name = `${other.id}/planted.png`;
    const c = await rawClient();
    try {
      await c.query(
        `insert into storage.objects (bucket_id, name, owner_id, metadata)
         values ('avatars', $1, $2, '{"mimetype":"image/png"}'::jsonb)
         on conflict do nothing`,
        [name, me.id],
      );
    } finally {
      await c.end();
    }

    await me.client.storage.from("avatars").remove([name]);

    const c2 = await rawClient();
    try {
      const { rows } = await c2.query(
        `select count(*)::int as n from storage.objects where bucket_id = 'avatars' and name = $1`,
        [name],
      );
      // 주인은 나인데 경로가 남의 폴더다 — 경로 판정이 없으면 지워졌을 것이다
      expect(rows[0]?.n).toBe(1);
    } finally {
      await c2.end();
    }

    // 뒷정리는 저장소 API 로 한다 — 저장소가 표를 직접 지우는 것을 막는다(실측).
    await admin.storage.from("avatars").remove([name]);
  });

  it("INV-E3(수정·삭제 쪽, S6): 남이 올린 파일은 지우지도 덮어쓰지도 못한다", async () => {
    const path = `${other.id}/avatar.png`;
    const put = await other.client.storage
      .from("avatars")
      .upload(path, png(), { contentType: "image/png", upsert: true });
    expect(put.error).toBeNull();

    // 지우기: 정책이 대상을 감추면 오류 없이 0건이 지워진다 — 남아 있는지를 본다
    await me.client.storage.from("avatars").remove([path]);
    const { data: still } = await admin.storage.from("avatars").list(other.id);
    expect((still ?? []).map((f) => f.name)).toContain("avatar.png");

    const over = await me.client.storage
      .from("avatars")
      .upload(path, png(), { contentType: "image/png", upsert: true });
    expect(over.error).not.toBeNull();
  });
});

describe("INV-E4: 아바타 버킷은 이미지만, 정해진 크기까지만 받는다", () => {
  it("INV-E4(형식, 실패경로 S7): 이미지가 아닌 파일은 자기 폴더에도 못 올린다", async () => {
    const { error } = await me.client.storage
      .from("avatars")
      .upload(`${me.id}/note.txt`, new Blob(["그냥 글자"], { type: "text/plain" }), {
        contentType: "text/plain",
        upsert: true,
      });
    expect(error).not.toBeNull();
  });

  it("INV-E4(크기, 실패경로 S7): 상한을 넘는 파일은 못 올린다", async () => {
    // 버킷 상한보다 확실히 큰 값. 형식은 이미지로 맞춰서 **크기 때문에** 막히는 것을 본다
    const big = new Blob([new Uint8Array(3 * 1024 * 1024)], { type: "image/png" });
    const { error } = await me.client.storage
      .from("avatars")
      .upload(`${me.id}/big.png`, big, { contentType: "image/png", upsert: true });
    expect(error).not.toBeNull();
  });

  it("INV-E4: 버킷에 형식·크기 제한이 실제로 적혀 있다", async () => {
    const c = await rawClient();
    try {
      const { rows } = await c.query(
        `select file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars'`,
      );
      // bigint 는 드라이버가 문자열로 준다 — 숫자로 바꿔 비교하지 않으면
      // 값이 제대로 들어 있어도 이 단언이 실패한다(2026-09-06 실측)
      // 값을 고정한다 — `> 0` 이면 상한이 1바이트여도 통과한다
      expect(Number(rows[0]?.file_size_limit)).toBe(1_048_576);
      expect(rows[0]?.allowed_mime_types ?? []).toContain("image/png");
    } finally {
      await c.end();
    }
  });
});

describe("아바타 목록은 자기 것만 보인다", () => {
  it("INV-E7(실패경로, S11): 비로그인은 버킷을 나열하지 못한다 — 폴더 이름이 곧 회원 id 명부다", async () => {
    await me.client.storage
      .from("avatars")
      .upload(`${me.id}/listed.png`, png(), { contentType: "image/png", upsert: true });

    const 지나가던사람 = anonClient();
    const { data } = await 지나가던사람.storage.from("avatars").list("");
    expect(data ?? []).toEqual([]);
  });

  it("INV-E7(반대 절반, S12): 사진 주소는 여전히 아무나 받는다 (2026-09-06 사람 결정)", async () => {
    // **이 둘을 같이 봐야 한다.** 앞만 보면 정책을 전부 닫아 사진이 아무에게도 안 보이는
    // 상태도 초록불이고, 뒤만 보면 명부가 열린 상태도 초록불이다.
    const path = `${me.id}/public.png`;
    const put = await me.client.storage
      .from("avatars")
      .upload(path, png(), { contentType: "image/png", upsert: true });
    expect(put.error).toBeNull();

    const url = anonClient().storage.from("avatars").getPublicUrl(path).data.publicUrl;
    const res = await fetch(url);
    expect(res.status).toBe(200);
  });

  it("INV-E7: 자기 폴더는 나열할 수 있다 — 뒷정리가 이 길로 돈다", async () => {
    const { data } = await me.client.storage.from("avatars").list(me.id);
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});

describe("INV-E8: avatar_url 도 자기 폴더만 가리킬 수 있다", () => {
  it("INV-E8(실패경로, S13): 남의 폴더를 가리키는 값은 거부된다", async () => {
    const { error } = await me.client
      .from("profiles")
      .update({ avatar_url: `${other.id}/avatar.png` })
      .eq("id", me.id);

    // 파일을 안 올려도 INV-E3 이 막으려던 피해에 도달하는 자리다 —
    // 모집글 상세에 작성자 사진이 붙는 순간 남의 얼굴을 자기 얼굴로 걸 수 있다
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23514");
  });

  it("INV-E8(반대 절반): 자기 폴더를 가리키는 값은 저장된다", async () => {
    const path = `${me.id}/avatar.png`;
    const { error } = await me.client
      .from("profiles")
      .update({ avatar_url: path })
      .eq("id", me.id);
    expect(error).toBeNull();

    const { data } = await admin.from("profiles").select("avatar_url").eq("id", me.id).single();
    expect(data?.avatar_url).toBe(path);
  });
});

describe("INV-E9: 이름에 제어문자를 넣을 수 없다", () => {
  it("INV-E9(실패경로, S14): 제어문자가 섞인 이름은 거부된다", async () => {
    const { error } = await me.client
      .from("profiles")
      .update({ username: `유${String.fromCharCode(0x202a)}나` })
      .eq("id", me.id);

    expect(error).not.toBeNull();
    expect(error?.code).toBe("23514");
  });

  it("INV-E9(반대 절반): 보통 이름은 그대로 저장된다", async () => {
    const { error } = await me.client
      .from("profiles")
      .update({ username: "유나 리" })
      .eq("id", me.id);
    expect(error).toBeNull();
  });
});

describe("INV-E5: 프로필의 지역은 고정 목록의 값이거나 비어 있다", () => {
  it("INV-E5(실패경로, S8): 목록에 없는 지역으로는 못 바꾼다", async () => {
    const { error } = await me.client
      .from("profiles")
      .update({ region: "없는지역" })
      .eq("id", me.id);
    expect(error).not.toBeNull();
    // 23503 = 외래 키. 스펙이 정한 강제 위치와 검사가 같은 것을 가리키게 한다
    expect(error?.code).toBe("23503");

    const { data } = await admin.from("profiles").select("region").eq("id", me.id).single();
    expect(data?.region).not.toBe("없는지역");
  });

  it("INV-E5(반대 절반, S9): 목록의 값으로 바꾸거나 비울 수 있다", async () => {
    const ok = await me.client.from("profiles").update({ region: "seoul" }).eq("id", me.id);
    expect(ok.error).toBeNull();

    const cleared = await me.client.from("profiles").update({ region: null }).eq("id", me.id);
    expect(cleared.error).toBeNull();

    const { data } = await admin.from("profiles").select("region").eq("id", me.id).single();
    expect(data?.region).toBeNull();
  });
});
