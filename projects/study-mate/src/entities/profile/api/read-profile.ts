import { createServerSupabase } from "@/shared/api/supabase/server-client";
import { throwDbError } from "@/shared/lib/db-error";
import type { ProfileCard } from "../model/profile";

type Row = {
  id: string;
  username: string;
  bio: string | null;
  region: string | null;
  interest: { id: string; name: string } | null;
};

type RegionRow = { id: string; name: string };

/**
 * 한 사람의 프로필. **인가는 여기서 하지 않는다** — 누가 누구의 프로필을 읽을 수 있는지는
 * 접근 정책이 정한다(INV-Z13, 강제 위치는 `profiles_read` 의 `private.profile_is_visible`).
 * 볼 수 없는 사람의 id 를 넣으면 행이 0개로 온다.
 *
 * 그래서 이 함수는 **내 프로필 전용이 아니다.** 부르는 자리가 세션에서 꺼낸 내 id 를 넣기
 * 때문에 지금은 내 것만 읽지만, 남의 id 를 넣어도 새는 값이 없다.
 *
 * **지역 이름은 따로 읽는다.** `profiles.region` 은 `regions` 를 가리키는 외래 키가 아니라
 * 그냥 텍스트라(0002 가 지역을 고정 목록으로 뽑을 때 프로필 쪽은 안 따라갔다) 한 번의
 * 질의로 임베드할 수 없다. 관심분야는 외래 키가 있어서 같이 온다.
 *
 * **두 질의를 나란히 던진다.** 앞의 결과를 기다렸다가 지역을 읽으면 이 함수만 왕복 2회가
 * 되고, 화면의 나머지 조회 셋이 병렬인 만큼 이 갈래가 대기 시간을 정한다. 지역은 여덟 줄
 * (0002)이라 통째로 받아 코드를 찾는 편이 왕복 한 번보다 싸다.
 * 근본 해결은 `profiles.region` 에 외래 키를 거는 것이고, 백로그에 있다.
 */
export async function readProfile(
  userId: string,
  createSupabase: typeof createServerSupabase = createServerSupabase,
): Promise<ProfileCard | null> {
  const supabase = await createSupabase();

  const [profile, regions] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, bio, region, interest:categories(id, name)")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("regions").select("id, name"),
  ]);

  if (profile.error) throwDbError("프로필", profile.error);
  if (!profile.data) return null;

  // **지역 목록의 실패는 삼키지 않는다.** null 로 떨어뜨리면 화면에서 「지역을 아직 안
  // 정했다」와 구분되지 않는다 — 설정이 없어서 안 보이는 것과 고장이 같은 모습이 된다.
  if (regions.error) throwDbError("지역 목록", regions.error);

  const row = profile.data as unknown as Row;
  const name = ((regions.data ?? []) as RegionRow[]).find((r) => r.id === row.region)?.name ?? null;

  return {
    id: row.id,
    username: row.username,
    bio: row.bio,
    regionCode: row.region,
    // 목록에 없는 코드면 null 이다 — 코드를 그대로 그리면 화면에 `gyeonggi` 가 나온다
    regionName: name,
    interestCategoryId: row.interest?.id ?? null,
    interestCategoryName: row.interest?.name ?? null,
  };
}
