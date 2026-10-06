import Link from "next/link";
import { LogoMark } from "@/shared/ui/logo";

// 사업자 정보는 출시 전에 채운다(통신판매업 표시 의무).
const BIZ: ReadonlyArray<readonly [string, string]> = [
  ["상호", "네오코드"],
  ["대표자", "(출시 전 기재)"],
  ["사업자등록번호", "(출시 전 기재)"],
  ["통신판매업 신고번호", "(출시 전 기재)"],
  ["주소", "(출시 전 기재)"],
  ["고객센터", "(출시 전 기재)"],
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <p className="footer-logo">
              <LogoMark size={28} />
              팬꾹
            </p>
            <dl className="biz">
              {BIZ.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <nav className="footer-links" aria-label="서비스 정책">
            <Link href="/terms">이용약관</Link>
            <Link href="/privacy">개인정보처리방침</Link>
            <Link href="/support">고객센터</Link>
            <Link href="/about">팬꾹 소개</Link>
          </nav>
        </div>
        <p className="footer-copy">&copy; 2026 네오코드. All rights reserved.</p>
      </div>
    </footer>
  );
}
