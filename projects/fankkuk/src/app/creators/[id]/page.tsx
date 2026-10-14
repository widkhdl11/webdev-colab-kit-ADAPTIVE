import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { readCreatorCards } from "@/entities/creator/api/creator-reads";
import { readCreatorLinkExtras } from "@/entities/creator/api/creator-link-reads";
import { oldPageRouteOf } from "@/entities/creator/model/creator-handle";
import { createPublicReadSupabase, readPublicStorageBase } from "@/shared/api/supabase/detached";
import { loadCreatorLinkPage } from "@/widgets/creator-profile/api/load-creator-link";
import { creatorLinkMetadata, requestOrigin } from "@/widgets/creator-profile/model/link-metadata";
import { CreatorProfilePage } from "@/widgets/creator-profile/ui/creator-profile-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

// 옛 크리에이터 페이지 주소 (creator-link INV-E5). 링크용 아이디가 있으면 링크 주소로 영구 넘기기(308),
// 없으면 이 주소가 그대로 선물 링크 페이지다(같은 읽기·같은 화면). 찾기 노출을 껐어도 주소로는 열린다(my-account INV-A10 S10b).
// 본인 확인 전·없는 사람은 없는 주소로 취급한다.
// 넘길지는 크리에이터 한 명의 공개 읽기(쿠키 없는 클라이언트) 하나로 정한다 — 넘기는 요청은 로그인 확인·헤더·나머지 읽기를 하지 않는다.
// 같은 읽기를 미리보기 정보(generateMetadata)와 페이지가 나눠 쓴다(React cache).

const publicCreator = cache(async (creatorId: string) => (await readCreatorCards(createPublicReadSupabase(), { signedIn: false, onlyId: creatorId }))[0] ?? null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const creator = await publicCreator(id);
  if (!creator || oldPageRouteOf(creator).kind === "redirect") return {};
  return creatorLinkMetadata(creator, requestOrigin(await headers()), (await readCreatorLinkExtras(createPublicReadSupabase(), creator.id)).look);
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  const creator = await publicCreator(id);
  if (!creator) notFound();
  const route = oldPageRouteOf(creator);
  if (route.kind === "redirect") permanentRedirect(route.to);
  const { supabase, viewer } = await loadSession();
  const [header, data] = await Promise.all([
    readSiteHeader(supabase, viewer, "/creators"),
    loadCreatorLinkPage({ client: supabase, viewer, creatorId: id, creator, photoBase: readPublicStorageBase() }),
  ]);
  if (!data) notFound();
  return (
    <>
      <SiteHeader {...header} />
      <CreatorProfilePage {...data.props} />
      <SiteFooter />
    </>
  );
}
