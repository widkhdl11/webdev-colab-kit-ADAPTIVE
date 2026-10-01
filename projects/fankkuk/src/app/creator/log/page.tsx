import { SAMPLE_ACCESS_LOG, SAMPLE_ACCESS_MONTH } from "@/entities/address/api/sample-access-log";
import { summarizeAccessLog } from "@/entities/address/model/access-log";
import { AccessLogPage } from "@/widgets/access-log/ui/access-log-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { sampleCreatorHeader } from "@/widgets/site-header/api/sample-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

// 예시 데이터로 그린다. 열람 기록에는 주소 값이 없다 — 시각·주문번호·요청자·결과만 받는다.
export default function Page() {
  return (
    <>
      <SiteHeader {...sampleCreatorHeader("/creator/log")} />
      <AccessLogPage
        monthLabel={SAMPLE_ACCESS_MONTH.label}
        approvedCount={SAMPLE_ACCESS_MONTH.approvedCount}
        summary={summarizeAccessLog(SAMPLE_ACCESS_LOG)}
        entries={SAMPLE_ACCESS_LOG}
      />
      <SiteFooter />
    </>
  );
}
