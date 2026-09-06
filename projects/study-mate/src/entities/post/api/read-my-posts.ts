import { createServerSupabase } from "@/shared/api/supabase/server-client";
import { throwDbError, throwShapeError } from "@/shared/lib/db-error";

/** 프로필의 「내가 쓴 모집글」 한 줄 */
export type MyPost = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly viewsCount: number;
  /** 저장된 값이 아니라 데이터베이스가 센 값이다 (0003) */
  readonly likesCount: number;
  readonly studyId: string;
  readonly studyTitle: string;
  readonly categoryId: string;
  readonly categoryName: string;
};

type Row = {
  id: string;
  title: string;
  created_at: string;
  views_count: number;
  likes_count: number;
  study: {
    id: string;
    title: string;
    category_id: string;
    category: { name: string };
  };
};

/**
 * 응답을 화면이 쓰는 모양으로. **모양이 어긋나면 던진다** — PostgREST 는 임베드에서 못
 * 만든 키를 오류 없이 빼고 돌려주므로, 확인하지 않으면 `undefined` 가 `string` 자리를
 * 통과해 「스터디 이름 없는 줄」이 그려진다(`entities/chat/api/read-chats.ts` 의 같은 판단).
 */
function toMyPost(row: Row): MyPost {
  const ok =
    typeof row.id === "string" &&
    typeof row.title === "string" &&
    typeof row.created_at === "string" &&
    typeof row.views_count === "number" &&
    typeof row.likes_count === "number" &&
    typeof row.study?.id === "string" &&
    typeof row.study?.title === "string" &&
    typeof row.study?.category_id === "string" &&
    typeof row.study?.category?.name === "string";
  if (!ok) throwShapeError("내가 쓴 모집글", `모집글 ${row.id}`, row);

  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    viewsCount: row.views_count,
    likesCount: row.likes_count,
    studyId: row.study.id,
    studyTitle: row.study.title,
    categoryId: row.study.category_id,
    categoryName: row.study.category.name,
  };
}

/**
 * 내가 작성한 모집글.
 *
 * **스터디는 `!inner` 다.** 모집글이 보이는 조건이 곧 그 스터디가 보이는 조건이라
 * (`posts_read` 가 `private.study_is_visible` 을 그대로 부른다) 스터디가 안 보이면 모집글
 * 행 자체가 안 온다. 바깥 조인이 덮을 상태가 없다.
 *
 * **지워진 스터디의 모집글은 뺀다.** `study_is_visible` 은 「지워지지 않았거나 내가
 * 호스트」라, 내가 지운 내 스터디의 모집글은 나에게 계속 보인다. 안 빼면 **「내가 만든
 * 스터디」에는 없는 스터디의 이름이 이 목록에 그려지고**, 그 링크가 살아 있는 상세로 간다 —
 * INV-Z10 이 "그 스터디의 모집글은 목록에 나타나지 않는다"고 정한 그 상태다. 「내가 만든
 * 스터디」가 지워진 것을 빼는 판단과 같은 방향으로 맞춘 것이다(한 화면 안에서 갈리면 안 된다).
 *
 * **`author_id` 로 거르는 것은 인가가 아니다.** 모집글 조회는 원래 공개고(발견은 로그인
 * 앞에 있다), 여기서 거르는 것은 「내 것만 보여 준다」는 화면의 뜻이다. 이 필터가 없으면
 * 남이 쓴 글 전부가 「내가 쓴 모집글」에 뜬다 — 값이 새지는 않지만 화면이 거짓말을 한다.
 */
export async function readMyPosts(
  userId: string,
  createSupabase: typeof createServerSupabase = createServerSupabase,
): Promise<readonly MyPost[]> {
  const supabase = await createSupabase();
  const { data, error } = await supabase
    .from("posts")
    .select(
      "id, title, created_at, views_count, likes_count, " +
        "study:studies!inner(id, title, category_id, category:categories!inner(name))",
    )
    .eq("author_id", userId)
    .is("study.deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throwDbError("내가 쓴 모집글", error);

  return ((data ?? []) as unknown as Row[]).map(toMyPost);
}
