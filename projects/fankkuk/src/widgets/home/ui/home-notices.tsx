import Link from "next/link";

// 메인 맨 아래 공지 세 줄 — 팬 메인과 크리에이터 메인이 같이 쓴다. 시안: v11 home-fan.html (.nlist)

export type HomeNotice = { id: string; title: string; date: string };

/** "2026-09-28" → "09.28" */
const shortDate = (date: string) => date.slice(5).replace("-", ".");

export function HomeNotices({ notices }: { notices: readonly HomeNotice[] }) {
  return (
    <section className="section section--compact" aria-labelledby="notice-title">
      <div className="container">
        <div className="sec-head">
          <h2 id="notice-title">공지사항</h2>
        </div>
        {notices.length === 0 ? (
          <p className="empty">아직 공지가 없어요.</p>
        ) : (
          <ul className="nlist">
            {notices.map((n) => (
              <li key={n.id}>
                <Link href="/notices">
                  <b>{n.title}</b>
                  <span className="t-meta">{shortDate(n.date)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="sec-foot">
          <Link className="btn btn--line" href="/notices">
            전체 보기
          </Link>
        </div>
      </div>
    </section>
  );
}
