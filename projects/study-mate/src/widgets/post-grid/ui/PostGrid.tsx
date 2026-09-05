import { categoryColor } from "@/entities/category";
import type { PostSummary } from "@/entities/post";
import { CardGrid } from "@/shared/ui/section/Section";
import { PostCard } from "./PostCard";

/**
 * 모집글 카드 그리드. 홈의 「이번 주 새로 열린 스터디」와 목록 화면이 같은 것을 쓴다 —
 * 카드가 두 벌이면 한쪽만 고쳐지는 날이 온다.
 */
export function PostGrid({
  posts,
  columns = 3,
  empty = "아직 모집글이 없습니다.",
}: {
  posts: readonly PostSummary[];
  columns?: 2 | 3;
  empty?: string;
}) {
  if (posts.length === 0) return <p>{empty}</p>;

  return (
    <CardGrid columns={columns}>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} color={categoryColor(post.study.categoryId)} />
      ))}
    </CardGrid>
  );
}
