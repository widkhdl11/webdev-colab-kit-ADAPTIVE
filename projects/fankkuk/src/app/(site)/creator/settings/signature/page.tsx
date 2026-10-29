import { redirect } from "next/navigation";
import { readOwnCreatorId } from "@/entities/creator/api/creator-reads";
import { readMyPendingSignatureLink } from "@/entities/creator/api/signature-link-reads";
import { CREATOR_SETTINGS, CREATOR_SIGNATURE_LINK, FAN_HOME } from "@/entities/session/model/home-path";
import { SignatureLinkPanel } from "@/features/signature-link/ui/signature-link-panel";
import { readSealingPublicKeyPem } from "@/shared/lib/envelope/sealing-key-config";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 크리에이터 상세 설정 → 「승인 서명 연결하기」·「다시 연결」(approval-signature INV-S16, UX 명세 signup.md 「크리에이터 설정 — 승인 서명 줄」).
// 가입 5단계와 같은 카드(SignatureLinkPanel)다 — 「이전」은 상세 설정으로, 「나중에 하기」는 없다, 연결되면 「확인」으로 상세 설정에 돌아간다.
// 다시 연결해도 새 시험 서명이 검증될 때까지 지금 연결은 그대로다(DB 가 검증된 요청의 정보로만 바꾼다).
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect(`/login?next=${CREATOR_SIGNATURE_LINK}`);
  const [header, creatorId, pending] = await Promise.all([
    readSiteHeader(supabase, viewer, CREATOR_SETTINGS),
    readOwnCreatorId(supabase),
    readMyPendingSignatureLink(supabase),
  ]);
  if (!creatorId) throw new Error("크리에이터 줄을 찾지 못했다");
  return (
    <>
      <SiteHeader {...header} />
      <MyShell width="form">
        <header className="page-head">
          <h1 className="ph-title">상세 설정</h1>
        </header>
        <SignatureLinkPanel
          creatorId={creatorId}
          sealingKeyPem={readSealingPublicKeyPem(process.env)}
          prevHref={`${CREATOR_SETTINGS}#more`}
          done={{ label: "확인", href: `${CREATOR_SETTINGS}#more` }}
          pending={pending}
        />
      </MyShell>
      <SiteFooter />
    </>
  );
}
