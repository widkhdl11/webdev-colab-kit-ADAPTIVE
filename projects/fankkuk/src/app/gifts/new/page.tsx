import { readCreatorCards } from "@/entities/creator/api/creator-reads";
import { readViewer } from "@/entities/session/model/viewer";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { GiftRegisterPage } from "@/widgets/gift-register/ui/gift-register-page";
import { sampleFanHeader } from "@/widgets/site-header/api/sample-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";

export const dynamic = "force-dynamic";

const PAYMENT_NOTICE: Record<string, string> = {
  failed: "결제를 마치지 못해 선물이 등록되지 않았어요. 다시 시도해 주세요.",
  in_progress: "같은 결제를 처리하는 중이에요. 잠시 뒤 선물 내역을 확인해 주세요.",
};

// 크리에이터 목록은 DB(본인 확인을 마친 크리에이터)에서 읽는다. 평균 승인 시간은 승인 기록으로 계산한 값,
// 기록이 없으면 소개 칸 값(approvalTimeOf — 다른 화면과 같은 값).
// ?creator=<id> 로 들어오면(크리에이터 페이지의 「선물 보내기」) 그 사람을 미리 고른다. 목록에 없는 id 는 무시한다.
// 헤더는 아직 예시 — 내 선물 화면을 DB 에 잇는 단계에서 바꾼다.
export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { creator, payment } = await searchParams;
  const supabase = await createRequestSupabase();
  const viewer = await readViewer(supabase);
  const creators = await readCreatorCards(supabase, { signedIn: viewer !== null });
  const initialCreatorId = typeof creator === "string" && creators.some((c) => c.id === creator) ? creator : "";
  const notice = typeof payment === "string" ? PAYMENT_NOTICE[payment] : undefined;
  return (
    <>
      <SiteHeader {...sampleFanHeader("/gifts/new")} />
      <GiftRegisterPage
        creators={creators}
        initialCreatorId={initialCreatorId}
        clientKey={process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? ""}
        notice={notice}
      />
      <SiteFooter />
    </>
  );
}
