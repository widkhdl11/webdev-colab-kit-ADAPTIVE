import { notFound, redirect } from "next/navigation";
import { resolveCreatorHandle } from "@/entities/creator/api/creator-link-reads";
import { parseTogetherKey, togetherPath } from "@/entities/together/model/together-path";
import { senderRoleAllowed } from "@/features/gift-register/model/sender-rule";
import { createPublicReadSupabase, readPublicStorageBase } from "@/shared/api/supabase/detached";
import { loadTogetherPage } from "@/widgets/together/api/load-together";
import { TogetherPage } from "@/widgets/together/ui/together-page";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";

export const dynamic = "force-dynamic";

// 「○○님과 함께한 시간」 /gifts/with/{크리에이터의 링크 주소 또는 ID} (together INV-F1).
// 주소는 어느 크리에이터인지만 정한다 — 내용은 로그인한 사람의 주문에서만 DB 본인 읽기 함수가 만든다. 그 크리에이터에게 센 선물이 없으면
// (다른 팬·그 크리에이터·운영자 계정으로 열어도) 없는 페이지와 같다. 로그인하지 않았으면 로그인으로, 돌아올 주소를 붙인다.
// 링크 주소 찾기는 로그인과 상관없는 공개 읽기다. 옛 아이디·ID 주소로 열면 지금 링크 주소로 넘긴다.

type Props = { params: Promise<{ key: string }> };

export default async function Page({ params }: Props) {
  const { key } = await params;
  const { supabase, viewer } = await loadSession();
  if (!viewer) redirect(`/login?next=/gifts/with/${encodeURIComponent(key)}`);
  if (!senderRoleAllowed(viewer.role)) notFound();
  const parsed = parseTogetherKey(key);
  if (parsed.kind === "invalid") notFound();
  let creatorId: string;
  if (parsed.kind === "handle") {
    const resolved = await resolveCreatorHandle(createPublicReadSupabase(), parsed.handle);
    if (!resolved) notFound();
    creatorId = resolved.creatorId;
  } else {
    creatorId = parsed.creatorId;
  }
  const data = await loadTogetherPage({ client: supabase, viewer, creatorId, photoBase: readPublicStorageBase() });
  if (!data) notFound();
  if (data.path !== `/gifts/with/${key}`) redirect(togetherPath({ id: data.summary.creatorId, handle: data.summary.creatorHandle }));
  return (
    <>
      <SiteHeader {...await readSiteHeader(supabase, viewer, "/gifts")} />
      <TogetherPage {...data} />
      <SiteFooter />
    </>
  );
}
