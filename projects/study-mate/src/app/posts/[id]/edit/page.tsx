import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readUnreadNotificationCount } from "@/entities/notification";
import { readPostForEdit } from "@/entities/post";
import { currentUser } from "@/entities/session";
import { EditPostForm } from "@/features/edit-post";
import { FormPage } from "@/shared/ui/form-page";
import { SkipLink } from "@/shared/ui/skip-link/SkipLink";
import { canonicalUuid } from "@/shared/lib/uuid";
import { SiteFooter } from "@/widgets/site-footer";
import { SiteHeader } from "@/widgets/site-header";

export const metadata: Metadata = { title: "모집글 수정 — Study Mate" };

// 로그인해야 들어올 수 있다 — 요청 프록시가 막는다
// (INV-A1, PROTECTED_PATTERNS 의 /posts/[id]/edit).
export const dynamic = "force-dynamic";

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  const { id } = await params;
  const postId = canonicalUuid(id);

  const [post, unread] = await Promise.all([
    user && postId ? readPostForEdit(postId, user.id) : Promise.resolve(null),
    user ? readUnreadNotificationCount() : Promise.resolve(0),
  ]);

  // **없는 글과 남의 글을 화면에서 같게 만든다.** 「고칠 권한이 없습니다」를 따로 그리면
  // 그 화면 하나로 "이 id 의 모집글이 있다"를 확인할 수 있게 된다. 판독기가 둘을 이미
  // 같은 null 로 합쳐 두었고, 여기서도 같은 404 로 떨어뜨린다.
  if (post === null) notFound();

  return (
    <>
      <SkipLink />
      <SiteHeader signedIn={user !== null} unreadCount={unread} />

      <main id="main">
        <FormPage
          title="모집글 수정"
          sub="고친 내용은 저장하는 즉시 목록과 상세 화면에 나옵니다."
        >
          <EditPostForm post={post} />
        </FormPage>
      </main>

      <SiteFooter signedIn={user !== null} />
    </>
  );
}
