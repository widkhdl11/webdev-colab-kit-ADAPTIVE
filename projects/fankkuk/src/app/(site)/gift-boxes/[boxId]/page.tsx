import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readBoxForFan } from "@/entities/revgift-box/api/box-reads";
import { readSealingPublicKeyPem } from "@/shared/lib/envelope/sealing-key-config";
import { BoxApplyPage } from "@/widgets/revgift-box/ui/box-apply-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "선물함 신청 — 팬꾹", robots: { index: false } };

// 팬 신청 화면(revgift-box INV-GB4·GB6·GB9 · 화면 명세 docs/ux/pages/gift-boxes-boxId.md).
// 비공개 선물함은 초대 링크의 토큰(?invite=)이 맞아야 보인다 — 틀리거나 없으면 없는 주소와 같다(DB 읽기 함수가 판정).
// 팔로우·신청 상태도 DB 가 로그인 토큰으로 정해 준다. 받을 주소는 신청 때마다 입력한다(revgift-box INV-GB6 — 팬 등록 주소는 없다).
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ boxId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ boxId }, sp] = await Promise.all([params, searchParams]);
  const token = typeof sp.invite === "string" && sp.invite.length <= 200 ? sp.invite : null;
  const { supabase, viewer } = await loadSession();
  const box = await readBoxForFan(supabase, boxId, token);
  if (!box) notFound();
  const header = await readSiteHeader(supabase, viewer, `/gift-boxes/${box.id}`);
  return (
    <>
      <SiteHeader {...header} />
      <BoxApplyPage box={box} token={token} accountId={viewer?.userId ?? null} sealingKeyPem={readSealingPublicKeyPem(process.env)} now={new Date().toISOString()} />
      <SiteFooter />
    </>
  );
}
