import { describe, expect, it, vi } from "vitest";
import type { createServerSupabase } from "@/shared/api/supabase/server-client";
import { readProfile } from "./read-profile";

const 나 = "11111111-1111-4111-8111-111111111111";

type 행 = Record<string, unknown>;

function 프로필(덮어쓸: 행 = {}): 행 {
  return {
    id: 나,
    username: "유나",
    bio: null,
    avatar_url: null,
    region_code: "seoul",
    region: { name: "서울" },
    interest: { id: "growth", name: "자기계발" },
    ...덮어쓸,
  };
}

/** 무엇을 물었는지까지 기록하는 가짜 */
function 가짜DB(옵션: { 행?: 행 | null; 오류?: { code?: string; message?: string } } = {}) {
  const 건조건: Record<string, unknown> = {};
  let 질의수 = 0;
  const 클라이언트생성 = vi.fn(async () => ({
    from(table: string) {
      질의수 += 1;
      건조건.table = table;
      const q = {
        select(columns: string) {
          건조건.columns = columns;
          return q;
        },
        eq(c: string, v: unknown) {
          건조건[`eq:${c}`] = v;
          return q;
        },
        maybeSingle: async () => ({
          data: "행" in 옵션 ? 옵션.행 : 프로필(),
          error: 옵션.오류 ?? null,
        }),
      };
      return q;
    },
    storage: {
      from() {
        return {
          getPublicUrl: (path: string) => ({
            data: { publicUrl: `http://로컬/storage/${path}` },
          }),
        };
      },
    },
  }));
  return {
    factory: 클라이언트생성 as unknown as typeof createServerSupabase,
    건조건,
    클라이언트생성,
    get 질의수() {
      return 질의수;
    },
  };
}

describe("프로필 조회", () => {
  it("id 로 한 사람만 묻는다", async () => {
    const db = 가짜DB();
    await readProfile(나, db.factory);

    expect(db.건조건.table).toBe("profiles");
    expect(db.건조건["eq:id"]).toBe(나);
  });

  it("한 질의로 끝난다 — 지역을 따로 읽던 자리는 외래 키가 생기면서 없어졌다", async () => {
    const db = 가짜DB();
    await readProfile(나, db.factory);

    expect(db.질의수).toBe(1);
    expect(db.클라이언트생성).toHaveBeenCalledTimes(1);
    // 지역 이름을 임베드로 가져온다는 것이 그 근거다
    expect(db.건조건.columns).toContain("region:regions(name)");
  });

  it("지역 코드와 이름을 같이 준다", async () => {
    const db = 가짜DB();

    const p = await readProfile(나, db.factory);
    expect(p?.regionCode).toBe("seoul");
    expect(p?.regionName).toBe("서울");
    expect(p?.interestCategoryId).toBe("growth");
    expect(p?.interestCategoryName).toBe("자기계발");
  });

  it("지역을 아직 안 정했으면 둘 다 null 이다", async () => {
    const db = 가짜DB({ 행: 프로필({ region_code: null, region: null }) });

    const p = await readProfile(나, db.factory);
    expect(p?.regionCode).toBeNull();
    expect(p?.regionName).toBeNull();
  });

  it("사진은 경로가 아니라 주소로 나간다", async () => {
    const db = 가짜DB({ 행: 프로필({ avatar_url: `${나}/avatar.png` }) });

    const p = await readProfile(나, db.factory);
    // 데이터베이스에 담긴 것은 경로다. 전체 주소를 담으면 프로젝트 주소가 데이터에 박혀
    // 다른 환경에서 깨진 그림이 된다
    expect(p?.avatarUrl).toBe(`http://로컬/storage/${나}/avatar.png`);
  });

  it("사진을 안 올렸으면 null 이다 — 화면이 그때 이니셜을 그린다", async () => {
    const db = 가짜DB();

    const p = await readProfile(나, db.factory);
    expect(p?.avatarUrl).toBeNull();
  });

  it("행이 없으면 null 이다 — 화면이 그 갈래를 따로 그린다 (INV-A7 이 깨진 상태)", async () => {
    const db = 가짜DB({ 행: null });

    await expect(readProfile(나, db.factory)).resolves.toBeNull();
  });

  it("조회가 실패하면 원문을 밖으로 내보내지 않고 던진다", async () => {
    const 로그 = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = 가짜DB({ 오류: { code: "42501", message: "permission denied for profiles" } });

    await expect(readProfile(나, db.factory)).rejects.toThrow("프로필을(를) 읽지 못했다");
    expect(로그).toHaveBeenCalled();
    로그.mockRestore();
  });
});
