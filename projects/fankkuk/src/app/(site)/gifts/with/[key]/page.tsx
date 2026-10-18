import { notFound, redirect } from "next/navigation";
import { senderRoleAllowed } from "@/features/gift-register/model/sender-rule";
import { createPublicReadSupabase, readPublicStorageBase } from "@/shared/api/supabase/detached";
import { loadTogetherPage } from "@/widgets/together/api/load-together";
import { togetherRouteOf } from "@/widgets/together/api/together-route";
import { TogetherPage } from "@/widgets/together/ui/together-page";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";

export const dynamic = "force-dynamic";

// 「○○님과 함께한 시간」 /gifts/with/{크리에이터의 링크 주소 또는 ID} (together INV-F1).
// 주소는 어느 크리에이터인지만 정한다 — 내용은 로그인한 사람의 주문에서만 DB 본인 읽기 함수가 만든다. 그 크리에이터에게 센 선물이 없으면
// (다른 팬·그 크리에이터·운영자 계정으로 열어도) 없는 페이지와 같다. 로그인하지 않았으면 로그인으로, 돌아올 주소를 붙인다.
// 주소 읽기(공개 읽기)는 세션 읽기와 같이 보낸다. 옛 링크 주소·ID 주소면 기록을 읽기 전에 지금 링크 주소로 넘긴다.
// 기록 읽기와 머리줄 읽기는 같이 보낸다.

type Props = { params: Promise<{ key: string }> };

export default async function Page({ params }: Props) {
  const { key } = await params;
  const [{ supabase, viewer }, route] = await Promise.all([loadSession(), togetherRouteOf(createPublicReadSupabase(), key)]);
  if (!viewer) redirect(`/login?next=/gifts/with/${encodeURIComponent(key)}`);
  if (!senderRoleAllowed(viewer.role)) notFound();
  if (route.kind === "not_found") notFound();
  if (route.kind === "redirect") redirect(route.to);
  const [data, header] = await Promise.all([
    loadTogetherPage({ client: supabase, viewer, creatorId: route.creatorId, photoBase: readPublicStorageBase() }),
    readSiteHeader(supabase, viewer, "/gifts"),
  ]);
  if (!data) notFound();
  return (
    <>
      <SiteHeader {...header} />
      <TogetherPage {...data} />
      <SiteFooter />
    </>
  );
}
