import Link from "next/link";
import s from "./home.module.css";

// 메인 맨 아래 공지 세 줄 — 팬 메인과 크리에이터 메인이 같이 쓴다.

export type HomeNotice = { id: string; title: string; date: string };

/** "2026-09-28" → "09.28" */
const shortDate = (date: string) => date.slice(5).replace("-", ".");

export function HomeNotices({ notices }: { notices: readonly HomeNotice[] }) {
  return (
    <section className="block" aria-labelledby="notice-title">
      <div className="container">
        <div className="block-head">
          <h2 id="notice-title">공지사항</h2>
          <Link className="link-arrow" href="/notices">
            전체 보기 ›
          </Link>
        </div>
        {notices.length === 0 ? (
          <p className={s.empty}>아직 공지가 없어요.</p>
        ) : (
          <ul className={s["notice-list"]}>
            {notices.map((n) => (
              <li key={n.id}>
                <Link href="/notices">
                  <span className={s.t}>{n.title}</span>
                  <span className={s.d}>{shortDate(n.date)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
