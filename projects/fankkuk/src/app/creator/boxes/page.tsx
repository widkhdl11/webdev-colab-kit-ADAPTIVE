import { redirect } from "next/navigation";
import { readMyReceivedBoxes, readMyReplyPending } from "@/entities/gift-reply/api/gift-reply-reads";
import { FAN_HOME } from "@/entities/session/model/home-path";
import { ReceivedBoxesPage } from "@/widgets/approval-requests/ui/received-boxes-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 크리에이터 — 받은 선물(v18 시안 creator-boxes.html). 승인 요청 화면(/creator/requests)에서 나눈 화면이다 — 로그인·역할 확인은 그 화면과 같다.
// 받은 선물(gift-reply — 출고된 상자마다 받았어요·답장, 아직 답장 안 한 수는 본인에게만 INV-G10). 모두 인자 없이 로그인 토큰의 크리에이터 것만 돌려준다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect("/login");
  const [header, received, replyPending] = await Promise.all([
    readSiteHeader(supabase, viewer, "/creator/boxes"),
    readMyReceivedBoxes(supabase),
    readMyReplyPending(supabase),
  ]);
  return (
    <>
      <SiteHeader {...header} />
      <MyShell width="list">
        <ReceivedBoxesPage received={received} replyPending={replyPending} />
      </MyShell>
      <SiteFooter />
    </>
  );
}
