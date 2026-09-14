// 근거 스펙: docs/specs/profile-editing.md (INV-E1 · E3 · E5 · E6)
//
// **인가 자체는 여기서 못 본다** — 그건 접근 정책이 하고 실제 데이터베이스에 붙는 검사가
// 붙든다(tests/integration/profile-editing.test.ts). 여기서 붙드는 것은 **우리가 무엇을
// 보내는가**다: 어느 행을 고치는지, 사진을 어느 경로에 올리는지, 빈칸을 무엇으로 바꾸는지.

import { describe, expect, it, vi } from "vitest";
import { NO_SESSION_MESSAGE } from "@/entities/session";
import type { createServerSupabase } from "@/shared/api/supabase/server-client";
import { USERNAME_MAX } from "../model/limits";
import { makeSaveProfile, saveProfile } from "./save-profile";

const 나 = { id: "11111111-1111-4111-8111-111111111111" };

/**
 * 글자 하나를 코드 포인트로 만든다. **소스에 그 글자를 직접 박지 않는다** — 여기 다루는
 * 것이 「보이지 않는 글자」라 리터럴로 적으면 diff 에도 grep 에도 안 보이고, 파일을
 * 옮기거나 붙여 넣는 과정에 조용히 사라진다. 이 파일은 실제로 NUL 한 자를 박아 둔 탓에
 * **git 이 바이너리로 읽고 있었다**(2026-09-11) — 그동안 이 파일의 diff 는 아무도 못 봤다.
 */
const 글자 = (cp: number) => String.fromCodePoint(cp);

function 폼(values: Record<string, string> = {}, avatar?: File): FormData {
  const form = new FormData();
  const 기본 = { username: "유나", bio: "소개", region: "seoul", interest: "growth" };
  for (const [k, v] of Object.entries({ ...기본, ...values })) form.append(k, v);
  if (avatar) form.append("avatar", avatar);
  return form;
}

function 이미지(type = "image/png", bytes = 10): File {
  return new File([new Uint8Array(bytes)], "고른이름.png", { type });
}

function 가짜DB(
  옵션: {
    갱신오류?: { code?: string };
    업로드오류?: { message: string };
    옛경로?: string | null;
  } = {},
) {
  const 보낸것: Record<string, unknown>[] = [];
  const 조건: Record<string, unknown> = {};
  const 올린것: { path: string; type: string }[] = [];
  const 지운것: string[] = [];
  // **표와 버킷 이름을 기록한다.** 안 보면 `.from("profiles")` 를 아무 표로 바꿔도,
  // `.from("avatars")` 를 다른 버킷으로 바꿔도 전부 초록불이다(2026-09-06 test-auditor).
  const 표: string[] = [];
  const 버킷: string[] = [];

  const factory = vi.fn(async () => ({
    from(table: string) {
      표.push(table);
      return {
        update(payload: Record<string, unknown>) {
          보낸것.push(payload);
          return {
            eq(column: string, value: unknown) {
              조건[column] = value;
              return Promise.resolve({ error: 옵션.갱신오류 ?? null });
            },
          };
        },
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({
                  data: { avatar_url: 옵션.옛경로 ?? null },
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
    storage: {
      from(bucket: string) {
        버킷.push(bucket);
        return {
          upload: async (path: string, _file: unknown, opts: { contentType: string }) => {
            올린것.push({ path, type: opts.contentType });
            return { error: 옵션.업로드오류 ?? null };
          },
          remove: async (paths: string[]) => {
            지운것.push(...paths);
            return { error: null };
          },
        };
      },
    },
  }));

  return {
    factory: factory as unknown as typeof createServerSupabase,
    보낸것,
    조건,
    올린것,
    지운것,
    표,
    버킷,
  };
}

describe("프로필 저장", () => {
  it("INV-E1: 고치는 행은 세션의 사용자다 — 폼에 남의 id 를 넣어도 무시된다", async () => {
    const db = 가짜DB();
    const 남 = "99999999-9999-4999-8999-999999999999";

    await saveProfile(나, 폼({ id: 남, userId: 남 }), db.factory);

    expect(db.조건.id).toBe(나.id);
    expect(db.보낸것[0]).not.toHaveProperty("id");
  });

  it("네 값을 그대로 보낸다", async () => {
    const db = 가짜DB();

    await saveProfile(나, 폼(), db.factory);

    expect(db.보낸것[0]).toMatchObject({
      username: "유나",
      bio: "소개",
      region: "seoul",
      interest_category: "growth",
    });
  });

  it("INV-E5: 빈칸은 빈 문자열이 아니라 null 로 보낸다", async () => {
    const db = 가짜DB();

    // 빈 문자열을 그대로 보내면 외래 키에 걸려 저장이 통째로 실패한다 —
    // 「지역을 안 고름」이 오류가 된다
    await saveProfile(나, 폼({ region: "", interest: "", bio: "" }), db.factory);

    expect(db.보낸것[0]).toMatchObject({ region: null, interest_category: null, bio: null });
  });

  it("이름이 비면 데이터베이스에 손도 안 댄다", async () => {
    const db = 가짜DB();

    const 결과 = await saveProfile(나, 폼({ username: "  " }), db.factory);

    expect(결과.ok).toBe(false);
    expect(db.보낸것).toEqual([]);
  });

  it("이름 상한은 20자다 — 상수를 바꿔도 이 숫자는 안 따라간다", async () => {
    const db = 가짜DB();
    expect(USERNAME_MAX).toBe(20);

    const 결과 = await saveProfile(나, 폼({ username: "가".repeat(21) }), db.factory);

    expect(결과.ok).toBe(false);
    expect(db.보낸것).toEqual([]);
  });

  it("INV-E3: 사진은 자기 아이디 폴더에 올라가고, 파일 이름은 사용자에게서 안 받는다", async () => {
    const db = 가짜DB();

    await saveProfile(나, 폼({}, 이미지()), db.factory);

    expect(db.올린것).toHaveLength(1);
    const 올린경로 = db.올린것[0]!.path;
    // 첫 칸이 곧 인가다. 받으면 `../` 같은 것으로 폴더를 벗어나려는 시도가 여기 도착한다
    expect(올린경로.startsWith(`${나.id}/`)).toBe(true);
    // 사용자가 고른 파일 이름("고른이름.png")이 경로에 안 들어간다
    expect(올린경로).not.toContain("고른이름");
    expect(db.보낸것[0]?.avatar_url).toBe(올린경로);
  });

  it("저장할 때마다 다른 경로로 올린다 — 같은 주소를 덮으면 옛 사진이 캐시에서 계속 나온다", async () => {
    const a = 가짜DB();
    const b = 가짜DB();
    await saveProfile(나, 폼({}, 이미지()), a.factory);
    await saveProfile(나, 폼({}, 이미지()), b.factory);

    expect(a.올린것[0]!.path).not.toBe(b.올린것[0]!.path);
  });

  it("올바른 표와 버킷에 쓴다", async () => {
    const db = 가짜DB();

    await saveProfile(나, 폼({}, 이미지()), db.factory);

    expect(new Set(db.표)).toEqual(new Set(["profiles"]));
    expect(new Set(db.버킷)).toEqual(new Set(["avatars"]));
  });

  it("성공하면 옛 사진을 지운다 — 안 지우면 공개 버킷에 옛 얼굴이 계속 남는다", async () => {
    const db = 가짜DB({ 옛경로: `${나.id}/옛사진.png` });

    await saveProfile(나, 폼({}, 이미지()), db.factory);

    expect(db.지운것).toEqual([`${나.id}/옛사진.png`]);
  });

  it("사진을 안 고르면 옛 사진을 읽지도 지우지도 않는다", async () => {
    const db = 가짜DB({ 옛경로: `${나.id}/옛사진.png` });

    await saveProfile(나, 폼(), db.factory);

    expect(db.지운것).toEqual([]);
  });

  it("INV-E4: 이미지가 아닌 파일은 올리지도 않는다", async () => {
    const db = 가짜DB();

    const 결과 = await saveProfile(나, 폼({}, 이미지("application/pdf")), db.factory);

    expect(결과.ok).toBe(false);
    expect(db.올린것).toEqual([]);
    expect(db.보낸것).toEqual([]);
  });

  it("사진 업로드가 실패하면 프로필 행을 안 고친다 — 없는 파일을 가리키는 경로가 남지 않게", async () => {
    const db = 가짜DB({ 업로드오류: { message: "too large" } });

    const 결과 = await saveProfile(나, 폼({}, 이미지()), db.factory);

    expect(결과.ok).toBe(false);
    expect(db.보낸것).toEqual([]);
  });

  it("행 갱신이 실패하면 방금 올린 사진을 되돌린다 — 주인 없는 공개 파일이 남지 않게", async () => {
    const 로그 = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = 가짜DB({ 갱신오류: { code: "23503" } });

    const 결과 = await saveProfile(나, 폼({}, 이미지()), db.factory);

    expect(결과.ok).toBe(false);
    expect(db.지운것).toEqual([db.올린것[0]!.path]);
    로그.mockRestore();
  });

  it("고른 파일이 비어 있으면 「안 골랐다」로 넘기지 않는다", async () => {
    const db = 가짜DB();
    const 빈파일 = new File([], "empty.png", { type: "image/png" });

    const 결과 = await saveProfile(나, 폼({}, 빈파일), db.factory);

    // 조용히 무시하면 파일을 골랐는데 사진이 안 바뀌고 이유도 안 나온다
    expect(결과.ok).toBe(false);
    expect(db.올린것).toEqual([]);
  });

  it("이름에 제어문자가 섞이면 데이터베이스에 손도 안 댄다", async () => {
    const db = 가짜DB();

    const 결과 = await saveProfile(나, 폼({ username: `유${글자(0x00)}나` }), db.factory);

    // 강제 위치는 `profiles_username_no_control` 이다. 여기서 먼저 막는 이유는 그 제약이
    // 거부할 때 나오는 것이 영어 원문이라 화면에 그대로 못 내보내서다
    expect(결과.ok).toBe(false);
    expect(db.보낸것).toEqual([]);
  });

  // ── INV-T1 · INV-T2 (S6) — `docs/specs/text-display-integrity.md` ──────────
  //
  // **이 셋은 이 파일이 아니면 아무도 안 붙든다.** 위의 새 판정 호출을 통째로 지워도
  // 통합 검사는 그대로 초록불이다 — 데이터베이스 제약이 같은 값을 대신 거부하기 때문이다.
  // 바뀌는 것은 **사용자가 보는 문구** 하나이고, 그것이 이 판정이 있는 유일한 이유다 —
  // 제약까지 가면 화면에 「잠시 뒤 다시 시도해 주세요」가 뜨고, 다시 시도해도 절대
  // 성공하지 않는다 (2026-09-11 test-auditor).
  it("INV-T1 (S6): 보이지 않는 글자만으로 된 이름은 데이터베이스에 손도 안 댄다", async () => {
    // `formText` 의 `trim()` 은 이 값들을 하나도 안 자른다. 그러면 `!username` 이 거짓이
    // 돼서 이름이 있는 것처럼 지나가고, 멤버 목록에서 폭 0px 로 그려진다.
    for (const [이름표, 값] of [
      ["U+3000 전각 공백", 글자(0x3000)],
      ["U+00A0 줄바꿈 없는 공백", 글자(0x00a0)],
      ["U+200B 폭 없는 공백", 글자(0x200b)],
      ["U+2060 단어 이음", 글자(0x2060)],
      ["U+180E 몽골 모음 구분", 글자(0x180e)],
      ["U+FEFF BOM", 글자(0xfeff)],
      ["U+200D ZWJ 단독", 글자(0x200d)],
      ["U+3164 한글 채움", 글자(0x3164)],
    ] as const) {
      const db = 가짜DB();
      const 결과 = await saveProfile(나, 폼({ username: 값 }), db.factory);

      expect(결과, 이름표).toEqual({ ok: false, message: "이름을 적어 주세요" });
      expect(db.보낸것, `${이름표} 로만 된 이름이 데이터베이스까지 갔다`).toEqual([]);
    }
  });

  it("INV-T2 (S6): 양방향 서식 문자가 든 이름은 한국어 문구로 거부된다", async () => {
    // **열두 자를 다 본다.** 한 자만 재면 나머지를 여는 되돌림을 아무도 못 막는다 —
    // 어느 한 자가 화면을 깨는지는 그 문자가 아니라 값의 내용이 정한다(스펙 실측 ③).
    for (const cp of [
      0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068,
      0x2069,
    ]) {
      const db = 가짜DB();
      const 이름표 = `U+${cp.toString(16)}`;
      const 결과 = await saveProfile(나, 폼({ username: `김${글자(cp)}하늘` }), db.factory);

      expect(결과, 이름표).toEqual({
        ok: false,
        message: "화면에 안 보이는 글자가 섞여 있습니다. 붙여 넣지 말고 직접 입력해 주세요",
      });
      expect(db.보낸것, `${이름표} 가 든 이름이 데이터베이스까지 갔다`).toEqual([]);
    }
  });

  it("INV-T2 (S6, 반대 절반): 오른쪽-왼쪽 이름과 이모지가 든 이름은 그대로 간다", async () => {
    // 반대 절반이 없으면 판정을 「전부 거부」로 바꿔도 위 둘이 초록불이다.
    const ZWJ = 글자(0x200d);
    for (const 값 of ["가족", "دراسة", "לימוד", `${글자(0x1f468)}${ZWJ}${글자(0x1f469)}`]) {
      const db = 가짜DB();
      const 결과 = await saveProfile(나, 폼({ username: 값 }), db.factory);

      expect(결과, 값).toEqual({ ok: true, value: null });
      expect(db.보낸것[0]?.username, 값).toBe(값);
    }
  });

  // ── 판정 **순서** (2026-09-11 test-auditor) ─────────────────────────────
  //
  // **U+061C 하나가 이 순서를 가르는 유일한 값이다.** 지우는 집합과 금지 목록에 **둘 다**
  // 든 글자가 그것뿐이라, 「보이는 내용」과 「서식 문자」 판정이 동시에 참이 된다.
  // 다른 값은 어느 한쪽에만 걸려서 **두 블록의 자리를 바꿔도 답이 안 바뀐다** — 그래서
  // 위 검사들만으로는 순서가 안 붙들린다.
  //
  // 순서가 중요한 이유는 화면 문구다. 서식 문자 쪽이 먼저 걸리면 **칸이 비어 보이는데
  // 「지울 글자를 찾으라」**는 말이 나간다 — 막다른 길이다. 세 자리(이름·제목·메시지)가
  // 같은 순서여야 같은 값에 같은 설명이 나간다.
  it("INV-T1·T2 (S6, 순서): 두 판정에 다 걸리는 이름은 「적어 주세요」쪽이 이긴다", async () => {
    for (const [이름표, 값] of [
      ["U+061C 단독", 글자(0x061c)],
      ["전각 공백 + U+061C", 글자(0x3000) + 글자(0x061c)],
    ] as const) {
      const db = 가짜DB();
      const 결과 = await saveProfile(나, 폼({ username: 값 }), db.factory);

      expect(결과, 이름표).toEqual({ ok: false, message: "이름을 적어 주세요" });
      expect(db.보낸것, 이름표).toEqual([]);
    }
  });

  it("사진을 안 고르면 기존 사진을 그대로 둔다 — 안 보낸 것과 지운 것은 다르다", async () => {
    const db = 가짜DB();

    await saveProfile(나, 폼(), db.factory);

    expect(db.올린것).toEqual([]);
    expect(db.보낸것[0]).not.toHaveProperty("avatar_url");
  });

  it("저장이 실패하면 원문을 그대로 보여 주지 않는다", async () => {
    const 로그 = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = 가짜DB({ 갱신오류: { code: "23503" } });

    const 결과 = await saveProfile(나, 폼(), db.factory);

    expect(결과.ok).toBe(false);
    if (!결과.ok) expect(결과.message).not.toContain("23503");
    로그.mockRestore();
  });

  it("INV-E6: 세션이 없으면 데이터베이스에 손도 안 댄다", async () => {
    const db = 가짜DB();
    const 지우기 = vi.fn();
    const 액션 = makeSaveProfile(async () => null, {
      createSupabase: db.factory,
      revalidatePaths: 지우기,
    });

    await expect(액션(폼())).resolves.toEqual({ ok: false, message: NO_SESSION_MESSAGE });
    expect(db.보낸것).toEqual([]);
    expect(지우기).not.toHaveBeenCalled();
  });

  it("저장에 성공하면 프로필 화면 둘을 다시 받게 한다", async () => {
    const db = 가짜DB();
    const 지우기 = vi.fn();
    const 액션 = makeSaveProfile(async () => 나, {
      createSupabase: db.factory,
      revalidatePaths: 지우기,
    });

    await expect(액션(폼())).resolves.toEqual({ ok: true, value: null });
    // 이 단언이 없으면 캐시 지우기를 통째로 지워도 초록불이다 — 프로필은 저장됐는데
    // 화면은 옛 이름을 보여 주는 상태가 아무 신호 없이 만들어진다.
    expect(지우기).toHaveBeenCalledWith("/profile", "/profile/edit");
  });
});
