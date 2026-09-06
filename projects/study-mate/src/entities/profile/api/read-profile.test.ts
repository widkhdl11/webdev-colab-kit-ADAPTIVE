import { describe, expect, it, vi } from "vitest";
import type { createServerSupabase } from "@/shared/api/supabase/server-client";
import { readProfile } from "./read-profile";

const 나 = "11111111-1111-4111-8111-111111111111";

const 프로필행 = {
  id: 나,
  username: "유나",
  bio: null,
  region: "seoul",
  interest: { id: "growth", name: "자기계발" },
};

const 지역목록 = [
  { id: "seoul", name: "서울" },
  { id: "busan", name: "부산·경남" },
];

/**
 * 표마다 다른 답을 주는 가짜. 이 함수는 질의 둘을 나란히 던지므로 표 이름으로 갈라야 한다.
 */
function 가짜DB(옵션: {
  profile?: unknown;
  profileError?: { code?: string; message?: string } | null;
  regions?: unknown[];
  regionsError?: { code?: string; message?: string } | null;
}) {
  const 건조건: Record<string, unknown> = {};
  const 클라이언트생성 = vi.fn(async () => ({
    from(table: string) {
      건조건[`from:${table}`] = true;
      const q = {
        select(columns: string) {
          건조건[`columns:${table}`] = columns;
          // regions 는 필터 없이 여기서 끝난다 — then 이 아니라 값으로 기다려진다
          return Object.assign(
            Promise.resolve({ data: 옵션.regions ?? 지역목록, error: 옵션.regionsError ?? null }),
            q,
          );
        },
        eq(c: string, v: unknown) {
          건조건[`eq:${table}.${c}`] = v;
          return q;
        },
        maybeSingle: async () => ({
          data: "profile" in 옵션 ? 옵션.profile : 프로필행,
          error: 옵션.profileError ?? null,
        }),
      };
      return q;
    },
  }));
  return {
    factory: 클라이언트생성 as unknown as typeof createServerSupabase,
    건조건,
    클라이언트생성,
  };
}

describe("프로필 조회", () => {
  it("id 로 한 사람만 묻는다", async () => {
    const db = 가짜DB({});
    await readProfile(나, db.factory);

    expect(db.건조건["eq:profiles.id"]).toBe(나);
  });

  it("클라이언트를 한 번만 만든다 — 질의 둘이 같은 세션 클라이언트를 쓴다", async () => {
    const db = 가짜DB({});
    await readProfile(나, db.factory);

    expect(db.클라이언트생성).toHaveBeenCalledTimes(1);
  });

  it("지역 코드를 이름으로 바꾼다", async () => {
    const db = 가짜DB({});

    const p = await readProfile(나, db.factory);
    expect(p?.regionCode).toBe("seoul");
    expect(p?.regionName).toBe("서울");
    expect(p?.interestCategoryName).toBe("자기계발");
  });

  it("목록에 없는 코드면 이름은 null 이다 — 코드를 그대로 그리면 화면에 `gyeonggi` 가 나온다", async () => {
    const db = 가짜DB({ profile: { ...프로필행, region: "gyeonggi" } });

    const p = await readProfile(나, db.factory);
    expect(p?.regionCode).toBe("gyeonggi");
    expect(p?.regionName).toBeNull();
  });

  it("지역을 아직 안 정했으면 둘 다 null 이다", async () => {
    const db = 가짜DB({ profile: { ...프로필행, region: null } });

    const p = await readProfile(나, db.factory);
    expect(p?.regionCode).toBeNull();
    expect(p?.regionName).toBeNull();
  });

  it("행이 없으면 null 이다 — 화면이 그 갈래를 따로 그린다 (INV-A7 이 깨진 상태)", async () => {
    const db = 가짜DB({ profile: null });

    await expect(readProfile(나, db.factory)).resolves.toBeNull();
  });

  it("지역 목록 조회가 실패하면 삼키지 않고 던진다", async () => {
    const 로그 = vi.spyOn(console, "error").mockImplementation(() => {});
    // null 로 떨어뜨리면 화면에서 「지역을 아직 안 정했다」와 구분되지 않는다 —
    // 설정이 없어서 안 보이는 것과 고장이 같은 모습이 된다.
    const db = 가짜DB({ regionsError: { code: "42501", message: "permission denied" } });

    await expect(readProfile(나, db.factory)).rejects.toThrow("지역 목록을(를) 읽지 못했다");
    expect(로그).toHaveBeenCalled();
    로그.mockRestore();
  });

  it("프로필 조회가 실패하면 원문을 밖으로 내보내지 않고 던진다", async () => {
    const 로그 = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = 가짜DB({ profileError: { code: "42501", message: "permission denied for profiles" } });

    await expect(readProfile(나, db.factory)).rejects.toThrow("프로필을(를) 읽지 못했다");
    로그.mockRestore();
  });
});
