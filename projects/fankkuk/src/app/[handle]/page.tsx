import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { readCreatorCards } from "@/entities/creator/api/creator-reads";
import { resolveCreatorHandle } from "@/entities/creator/api/creator-link-reads";
import { linkRouteOf } from "@/entities/creator/model/creator-handle";
import { createPublicReadSupabase, readPublicStorageBase } from "@/shared/api/supabase/detached";
import { loadCreatorLinkPage } from "@/widgets/creator-profile/api/load-creator-link";
import { creatorLinkMetadata, requestOrigin } from "@/widgets/creator-profile/model/link-metadata";
import { CreatorProfilePage } from "@/widgets/creator-profile/ui/creator-profile-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ handle: string }> };

// 선물 링크 주소 fankkuk.kr/{링크용 아이디} (creator-link INV-E2·E3·E5). 사이트의 다른 첫 단계 주소(/login 등)는 정적 경로가 먼저 잡는다 —
// 그 이름들은 DB 예약어라 아이디로 저장되지 않는다(S2c 시험이 목록을 맞춰 본다).
// 대문자 주소는 소문자로, 묶인 옛 아이디는 지금 아이디로 영구 넘기기(308). 본인 확인 전·없는 아이디는 없는 페이지.
// 아이디 찾기와 크리에이터 한 명 읽기는 로그인과 상관없는 공개 읽기라 쿠키 없는 클라이언트로 하고, 한 요청 안에서
// 미리보기 정보(generateMetadata)와 페이지가 같은 결과를 나눠 쓴다(React cache). 대문자 주소는 꼴 검사에서 걸러져 DB 를 부르지 않는다.

const linkRoute = cache(async (handle: string) => linkRouteOf(handle, await resolveCreatorHandle(createPublicReadSupabase(), handle)));

const publicCreator = cache(async (creatorId: string) => (await readCreatorCards(createPublicReadSupabase(), { signedIn: false, onlyId: creatorId }))[0] ?? null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const route = await linkRoute(handle);
  if (route.kind !== "show") return {};
  const creator = await publicCreator(route.creatorId);
  return creator ? creatorLinkMetadata(creator, requestOrigin(await headers())) : {};
}

export default async function Page({ params }: Props) {
  const { handle } = await params;
  const route = await linkRoute(handle);
  if (route.kind === "redirect") permanentRedirect(route.to);
  if (route.kind === "not_found") notFound();
  const [{ supabase, viewer }, creator] = await Promise.all([loadSession(), publicCreator(route.creatorId)]);
  if (!creator) notFound();
  const [header, data] = await Promise.all([
    readSiteHeader(supabase, viewer, "/creators"),
    loadCreatorLinkPage({ client: supabase, viewer, creatorId: route.creatorId, creator, photoBase: readPublicStorageBase() }),
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
