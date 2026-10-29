import { readMyInquiries } from "@/entities/inquiry/api/read-my-inquiries";
import { readMyInquiryRestricted } from "@/entities/inquiry/api/read-my-inquiry-restricted";
import { readPublicPrices } from "@/entities/payment/api/read-tier-prices";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";
import { SupportPage } from "@/widgets/support/ui/support-page";

export const dynamic = "force-dynamic";

// 누구나 보는 화면이지만 헤더는 로그인한 사람에 맞춘다 — 손님 헤더로 고정하면 로그인이 풀린 것처럼 보인다.
// 로그인했으면(운영자 포함 — 프로필이 있으면 문의를 남길 수 있다) 1:1 문의 양식이 실제로 접수하고, 「내 문의」를 함께 읽는다.
// 대표가 문의를 제한한 계정이면 양식 대신 안내를 보인다(admin-console INV-K12 — 실제로 막는 것은 DB).
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  const [header, prices, myInquiries, inquiryRestricted] = await Promise.all([
    readSiteHeader(supabase, viewer, "/support"),
    readPublicPrices(supabase),
    viewer ? readMyInquiries(supabase) : Promise.resolve([]),
    viewer ? readMyInquiryRestricted(supabase) : Promise.resolve(false),
  ]);
  return (
    <>
      <SiteHeader {...header} />
      <SupportPage prices={prices} signedIn={viewer !== null} myInquiries={myInquiries} inquiryRestricted={inquiryRestricted} />
      <SiteFooter />
    </>
  );
}
