import Link from "next/link";
import { Fragment } from "react";
import { bizInfoRows, SITE_INFO } from "@/shared/config/site-info";
import { LogoMark } from "@/shared/ui/logo";

// 사업자 정보는 shared/config/site-info 의 설정값을 읽는다(통신판매업 표시 의무). 값이 비면 자리표시가 나온다.
// 링크 두 묶음 — 정책(약관·처리방침·환불·분쟁·신고)과 안내(이용 안내·보안·검수·질문).
// 줄바꿈(design-rules 29절): 가운뎃점 덩어리는 \u2060 으로 붙이고, 사업자 정보 칸 안의 「 · 」로 나뉜 값(고객센터 이메일·전화번호)은 하나씩 .nw 로 묶는다.

const DOT = "\u2060·\u2060";

const POLICY_LINKS: ReadonlyArray<readonly [string, string]> = [
  ["/terms", "이용약관"],
  ["/privacy", "개인정보처리방침"],
  ["/refund", `취소${DOT}환불 규정`],
  ["/dispute", "분쟁 처리 안내"],
  ["/report", `신고${DOT}문의`],
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

/** 「a · b」 꼴 값은 a·b 를 하나씩 쪼개지 않게 묶는다(전화번호·이메일 덩어리). 나뉘지 않는 값은 그대로 — 긴 주소는 줄을 바꿀 수 있어야 한다. */
function keepParts(value: string) {
  const parts = value.split(" · ");
  if (parts.length < 2) return value;
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 ? " · " : null}
      <span className="nw">{part}</span>
    </Fragment>
  ));
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="pub-inner">
        <div className="footer-top">
          <p className="footer-logo">
            <LogoMark size={28} />
            팬꾹
          </p>
          <nav className="footer-links footer-policy" aria-label="서비스 정책">
            {POLICY_LINKS.map(([href, label]) => (
              <Link key={href} href={href} className={href === "/privacy" ? "footer-strong" : undefined}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <nav className="footer-links footer-guide" aria-label="이용 안내">
          {GUIDE_LINKS.map(([href, label]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>
        <dl className="biz">
          {bizInfoRows(SITE_INFO).map(([k, v]) => (
            <div key={k} className={k === "사업장 주소" ? "footer-address" : k === "고객센터" ? "footer-contact" : undefined}>
              <dt>{k}</dt>
              <dd>{keepParts(v)}</dd>
            </div>
          ))}
        </dl>
        <p className="footer-copy">&copy; 2026 {SITE_INFO.companyName}. All rights reserved.</p>
      </div>
    </footer>
  );
}
