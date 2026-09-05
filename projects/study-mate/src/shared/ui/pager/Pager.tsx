import Link from "next/link";
import styles from "./pager.module.css";

/** 앞뒤 두 쪽까지만 보여주고 나머지는 접는다 */
function windowOf(page: number, pageCount: number): number[] {
  const from = Math.max(1, Math.min(page - 2, pageCount - 4));
  const to = Math.min(pageCount, Math.max(page + 2, 5));
  const out: number[] = [];
  for (let i = from; i <= to; i += 1) out.push(i);
  return out;
}

export function Pager({
  page,
  pageCount,
  href,
  label = "쪽 이동",
}: {
  page: number;
  pageCount: number;
  /** 쪽 번호를 주소로 바꾸는 함수. 나머지 필터를 유지하는 것은 부르는 쪽의 일이다 */
  href: (page: number) => string;
  label?: string;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav className={styles.pager} aria-label={label}>
      {page > 1 ? (
        <Link href={href(page - 1)} aria-label="이전 쪽">
          ‹
        </Link>
      ) : (
        <span className={styles.disabled} aria-hidden="true">
          ‹
        </span>
      )}

      {windowOf(page, pageCount).map((n) =>
        n === page ? (
          <span key={n} className={styles.current} aria-current="page">
            {n}
          </span>
        ) : (
          <Link key={n} href={href(n)} aria-label={`${n}쪽`}>
            {n}
          </Link>
        ),
      )}

      {page < pageCount ? (
        <Link href={href(page + 1)} aria-label="다음 쪽">
          ›
        </Link>
      ) : (
        <span className={styles.disabled} aria-hidden="true">
          ›
        </span>
      )}
    </nav>
  );
}
