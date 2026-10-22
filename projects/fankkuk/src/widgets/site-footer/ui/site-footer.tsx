import Link from "next/link";
import { bizInfoRows, SITE_INFO } from "@/shared/config/site-info";
import { LogoMark } from "@/shared/ui/logo";

// 사업자 정보는 shared/config/site-info 의 설정값을 읽는다(통신판매업 표시 의무). 값이 비면 자리표시가 나온다.
// 링크 두 묶음 — 정책(약관·처리방침·환불·분쟁·신고)과 안내(이용 안내·보안·검수·질문).

const POLICY_LINKS: ReadonlyArray<readonly [string, string]> = [
  ["/terms", "이용약관"],
  ["/privacy", "개인정보처리방침"],
  ["/refund", "취소·환불 규정"],
  ["/dispute", "분쟁 처리 안내"],
  ["/report", "신고·문의"],
  ["/support", "고객센터"],
];

const GUIDE_LINKS: ReadonlyArray<readonly [string, string]> = [
  ["/about", "팬꾹 소개"],
  ["/pricing", "요금 안내"],
  ["/guide/fan", "팬 이용 안내"],
  ["/guide/creator", "크리에이터 이용 안내"],
  ["/security", "보안 안내"],
  ["/inspection", "검수 기준"],
  ["/faq", "자주 묻는 질문"],
  ["/notices", "공지사항"],
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="pub-inner">
        <div className="footer-grid">
          <div>
            <p className="footer-logo">
              <LogoMark size={28} />
              팬꾹
            </p>
            <dl className="biz">
              {bizInfoRows(SITE_INFO).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <nav className="footer-links" aria-label="서비스 정책">
            {POLICY_LINKS.map(([href, label]) => (
              <Link key={href} href={href} className={href === "/privacy" ? "footer-strong" : undefined}>
                {label}
              </Link>
            ))}
          </nav>
          <nav className="footer-links" aria-label="이용 안내">
            {GUIDE_LINKS.map(([href, label]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="footer-copy">&copy; 2026 {SITE_INFO.companyName}. All rights reserved.</p>
      </div>
    </footer>
  );
}
