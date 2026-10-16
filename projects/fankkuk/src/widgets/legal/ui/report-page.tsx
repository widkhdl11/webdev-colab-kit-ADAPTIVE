import { ReportForm } from "@/features/report-mail/ui/report-form";
import { NO_ADDRESS_ASK } from "@/shared/config/site-copy";
import { orBlank, SITE_INFO } from "@/shared/config/site-info";
import s from "./legal.module.css";

// 신고·문의(/report) — 로그인 없이 쓴다. 안내 페이지와 같은 머리 + 세 줄 요약, 그 아래 메일 양식 한 장.
const SUMMARY = [
  "팬꾹을 사칭하는 페이지, 허락 없이 쓰인 사진, 그 밖의 문의를 여기서 보낼 수 있어요.",
  "「이메일로 보내기」를 누르면 적은 내용이 담긴 이메일 앱이 열려요. 파일은 첨부할 수 없어요.",
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
              사칭 페이지 신고, 사진 권리 침해 신고, 일반 문의를 받아요.
            </p>
          </header>
          <div className={`card card--soft prose ${s.summary} ${s.prose}`}>
            <h2 className="t-card">요약</h2>
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
