import { redirect } from "next/navigation";
import { readMyAccessLog, readMyAccessMonthSummary } from "@/entities/address/api/access-log-rows";
import { monthLabelOf, seoulMonthKey } from "@/entities/address/model/access-log";
import { FAN_HOME } from "@/entities/session/model/home-path";
import { AccessLogPage } from "@/widgets/access-log/ui/access-log-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 열람 기록(my_access_log)은 로그인한 크리에이터의 주문에서 주소가 열린 줄만 온다(INV-P7, D12). 주소 값은 없다 — 시각·주문번호·몇 번째 출력만.
// 「이번 달」은 서울 기준 달력 달이고, 숫자 셋(승인·열림·재출력)은 DB 가 그 달로 직접 센다(my_access_month_summary).
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect("/login");
  const [header, entries, summary] = await Promise.all([
    readSiteHeader(supabase, viewer, "/creator/log"),
    readMyAccessLog(supabase),
    readMyAccessMonthSummary(supabase),
  ]);
  return (
    <>
      <SiteHeader {...header} />
      <MyShell width="list">
        <AccessLogPage
          monthLabel={monthLabelOf(seoulMonthKey(new Date().toISOString()))}
          summary={summary}
          entries={entries}
        />
      </MyShell>
      <SiteFooter />
    </>
  );
}
