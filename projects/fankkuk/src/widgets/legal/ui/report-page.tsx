import { ReportForm } from "@/features/report-mail/ui/report-form";
import { NO_ADDRESS_ASK } from "@/shared/config/site-copy";
import { orBlank, SITE_INFO } from "@/shared/config/site-info";
import s from "./legal.module.css";

// 신고·문의(/report) — 로그인 없이 쓴다. 안내 페이지와 같은 머리 + 세 줄 요약, 그 아래 메일 양식 한 장.
const SUMMARY = [
  "팬꾹을 사칭하는 페이지나 허락 없이 쓰인 사진을 신고할 수 있어요. 일반 문의도 받아요.",
  "「이메일로 보내기」를 누르면 적은 내용이 담긴 이메일 앱이 열려요. 이 화면에서는 파일을 첨부할 수 없어요.",
  NO_ADDRESS_ASK,
] as const;

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
              팬꾹 사칭 페이지, 사진 권리 침해를 신고하거나 일반 문의를 남길 수 있어요.
            </p>
          </header>
          <div className={`card card--soft prose ${s.summary} ${s.prose}`}>
            <h2 className="t-card">접수 전 확인해 주세요</h2>
            <ul className="dots">
              {SUMMARY.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div className={`card ${s.formCard}`}>
            <ReportForm to={to} toLabel={orBlank(to)} />
          </div>
        </div>
      </section>
    </main>
  );
}
