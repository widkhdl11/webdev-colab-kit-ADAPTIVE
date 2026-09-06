import { createServerSupabase } from "@/shared/api/supabase/server-client";
import { throwDbError } from "@/shared/lib/db-error";
import type { ProfileCard } from "../model/profile";

type Row = {
  id: string;
  username: string;
  bio: string | null;
  avatar_url: string | null;
  region_code: string | null;
  region: { name: string } | null;
  interest: { id: string; name: string } | null;
};

/**
 * 한 사람의 프로필. **인가는 여기서 하지 않는다** — 누가 누구의 프로필을 읽을 수 있는지는
 * 접근 정책이 정한다(INV-Z13, 강제 위치는 `profiles_read` 의 `private.profile_is_visible`).
 * 볼 수 없는 사람의 id 를 넣으면 행이 0개로 온다.
 *
 * 그래서 이 함수는 **내 프로필 전용이 아니다.** 부르는 자리가 세션에서 꺼낸 내 id 를 넣기
 * 때문에 지금은 내 것만 읽지만, 남의 id 를 넣어도 새는 값이 없다.
 *
 * **한 질의로 끝난다.** 2026-09-06 이전에는 지역 이름을 따로 읽었다 — `profiles.region` 이
 * `regions` 를 가리키는 외래 키가 아니었기 때문이다. 같은 사이클의 `0015` 가 그 외래 키를
 * 걸면서(INV-E5) 임베드가 가능해졌고, 목록을 통째로 받아 앱에서 찾던 코드는 근거를 잃었다.
 */
export async function readProfile(
  userId: string,
  createSupabase: typeof createServerSupabase = createServerSupabase,
): Promise<ProfileCard | null> {
  const supabase = await createSupabase();

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, username, bio, avatar_url, region_code:region, " +
        "region:regions(name), interest:categories(id, name)",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) throwDbError("프로필", error);
  if (!data) return null;

  const row = data as unknown as Row;

  // 담긴 것은 경로이고 주소는 여기서 만든다. 버킷이 공개라 서명이 필요 없다
  // (2026-09-06 사람 결정 — 모집글 상세가 비로그인에게 열려 있고 거기 얼굴이 나온다).
  // 이 호출은 문자열 조립이라 질의를 안 한다.
  const avatarUrl = row.avatar_url
    ? supabase.storage.from("avatars").getPublicUrl(row.avatar_url).data.publicUrl
    : null;

  return {
    id: row.id,
    username: row.username,
    bio: row.bio,
    avatarUrl,
    regionCode: row.region_code,
    // 목록에 없는 코드는 이제 외래 키가 막는다 — 임베드가 비면 그것은 지역을 안 정한 것이다
    regionName: row.region?.name ?? null,
    interestCategoryId: row.interest?.id ?? null,
    interestCategoryName: row.interest?.name ?? null,
  };
}
