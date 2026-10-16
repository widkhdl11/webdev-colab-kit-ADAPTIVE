import type { FaqItem } from "../model/faq-doc";
import s from "./legal.module.css";

// 자주 묻는 질문(/faq) — 안내 페이지 머리 + 세 줄 요약 + 접기 목록(공지사항·고객센터와 같은 .acc, <details> 라 스크립트 없이 열고 닫힌다).
type Props = {
  summary: readonly [string, string, string];
  items: readonly FaqItem[];
};

export function FaqPage({ summary, items }: Props) {
  return (
    <main id="main" className={s.page}>
      <section aria-labelledby="page-title">
        <div className="pub-inner">
          <header className="page-head">
            <div className="ph-row">
              <h1 className="ph-title" id="page-title">
                자주 묻는 질문
              </h1>
            </div>
            <p className="ph-desc">팬꾹을 쓰면서 자주 묻는 것을 모았어요.</p>
          </header>
          <div className={`card card--soft prose ${s.summary} ${s.prose}`}>
            <h2 className="t-card">요약</h2>
            <ul className="dots">
              {summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="acc">
            {items.map((f) => (
              <details key={f.q}>
                <summary>
                  <span className="q">
                    <b>{f.q}</b>
                  </span>
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      d="m4 7.5 6 6 6-6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </summary>
                <div className="ans">
                  <p>{f.a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
