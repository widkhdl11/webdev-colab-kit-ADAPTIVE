import { ReportForm } from "@/features/report-mail/ui/report-form";
import { NO_ADDRESS_ASK } from "@/shared/config/site-copy";
import { orBlank, SITE_INFO } from "@/shared/config/site-info";
import s from "./legal.module.css";

// 신고·문의(/report) — 로그인 없이 쓴다. 시안: docs/design/mockups/site/part7-2026-10-22/report.html (design-rules 28절).
// 머리 + 주소를 묻지 않는다는 안내 한 줄, 그 아래 메일 양식 한 장 — 머리와 같은 시작선, 680 한 기둥.
// (요약 판은 없앴다: 첫 줄은 머리 설명과 같은 말이라 빼고, 「이메일 앱이 열려요」 줄은 양식의 버튼 바로 위로 옮겼다)

export function ReportPage() {
  const to = SITE_INFO.supportEmail;
  return (
    <main id="main" className={s.page}>
      <section aria-labelledby="page-title">
        <div className="pub-inner">
          <header className="page-head">
            <div className="ph-row">
              <h1 className="ph-title" id="page-title">
                신고·문의
              </h1>
            </div>
            <p className="ph-desc">
              팬꾹 사칭 페이지, 사진 권리 침해를 신고하거나 일반 문의를 남길 수 있습니다.
            </p>
            <p className={`t-meta ${s.noAsk}`}>{NO_ADDRESS_ASK}</p>
          </header>
          <div className={`card ${s.formCard}`}>
            <ReportForm to={to} toLabel={orBlank(to)} />
          </div>
        </div>
      </section>
    </main>
  );
}
