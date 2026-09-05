import Link from "next/link";
import { categoryColor, type Category } from "@/entities/category";
import { SORT_LABEL, SORTS, type Sort } from "@/entities/post";
import type { Region } from "@/entities/region";
import { Button } from "@/shared/ui/button/Button";
import { ChipLink, ChipRow } from "@/shared/ui/chip/Chip";
import { Container } from "@/shared/ui/container/Container";
import { SearchIcon } from "@/shared/ui/icon/Icon";
import { buildQuery, toggleInList } from "@/shared/lib/query";
import styles from "./post-filters.module.css";

export type FilterState = {
  readonly q: string;
  readonly categories: readonly string[];
  readonly region: string;
  readonly openOnly: boolean;
  readonly sort: Sort;
};

/**
 * 필터 줄. 상태는 전부 주소에 있다 — 뒤로 가기·새로고침·공유가 그냥 동작하고,
 * 화면을 다시 그리는 데 브라우저 코드가 필요 없다.
 *
 * 카테고리 칩과 「모집중만 보기」는 **누르면 가는 곳이 정해져 있으므로 링크**이고,
 * 검색어·지역·정렬은 한 번에 적용하는 **폼**이다. 시안에는 고르자마자 적용되는 것처럼
 * 그려져 있었는데 브라우저 코드 없이는 안 되므로, 「적용」 버튼 하나가 셋을 함께 보낸다.
 */
export function PostFilters({
  state,
  categories,
  regions,
}: {
  state: FilterState;
  categories: readonly Category[];
  regions: readonly Region[];
}) {
  const linkTo = (next: Partial<FilterState>) =>
    `/posts${buildQuery({
      q: next.q ?? state.q,
      category: next.categories ?? state.categories,
      region: next.region ?? state.region,
      open: (next.openOnly ?? state.openOnly) ? "1" : undefined,
      sort: (next.sort ?? state.sort) === "latest" ? undefined : (next.sort ?? state.sort),
    })}`;

  return (
    <form action="/posts" method="get">
      {/* 칩과 토글은 링크라 폼 밖의 상태다. 적용할 때 같이 실어 보낸다 */}
      {state.categories.length > 0 ? (
        <input type="hidden" name="category" value={state.categories.join(",")} />
      ) : null}
      {state.openOnly ? <input type="hidden" name="open" value="1" /> : null}

      <Container as="section" className={styles.head}>
        <h1 className={`h-display ${styles.title}`}>모집글 찾기</h1>
        <p className={styles.sub}>
          카테고리와 지역으로 좁혀서, 지금 자리가 남은 스터디부터 봅니다.
        </p>

        <div className={styles.search} role="search">
          <SearchIcon size={20} />
          <label className="sr-only" htmlFor="q">
            모집글 검색
          </label>
          <input
            id="q"
            name="q"
            type="search"
            placeholder="스터디 이름이나 키워드로 검색"
            defaultValue={state.q}
          />
        </div>
      </Container>

      <Container as="section" className={styles.filters}>
        <h2 className="sr-only">모집글 필터</h2>
        <ChipRow>
          <ChipLink
            href={linkTo({ categories: [] })}
            color="yellow"
            selected={state.categories.length === 0}
            neutral
          >
            전체
          </ChipLink>
          {categories.map((c) => (
            <ChipLink
              key={c.id}
              href={linkTo({ categories: toggleInList(state.categories, c.id) })}
              color={categoryColor(c.id)}
              selected={state.categories.includes(c.id)}
            >
              {c.name}
            </ChipLink>
          ))}
        </ChipRow>

        <div className={styles.row}>
          <label className={styles.label} htmlFor="region">
            지역
          </label>
          <span className={styles.selectWrap}>
            <select id="region" name="region" defaultValue={state.region}>
              <option value="">전체 지역</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </span>

          <label className={styles.label} htmlFor="sort">
            정렬
          </label>
          <span className={styles.selectWrap}>
            <select id="sort" name="sort" defaultValue={state.sort}>
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABEL[s]}
                </option>
              ))}
            </select>
          </span>

          <Button tone="ink" size="sm" type="submit">
            적용
          </Button>

          {/*
            누르면 가는 곳이 정해져 있으므로 버튼이 아니라 링크다. aria-pressed 는 버튼의
            것이라 못 쓰고, 대신 **이름 자체가 지금 상태와 누르면 될 일을 말한다.**
            색만으로도 말하지 않는다 — 손잡이 위치가 같이 움직인다.
          */}
          <Link
            className={styles.toggle}
            href={linkTo({ openOnly: !state.openOnly })}
            data-on={state.openOnly ? "true" : "false"}
            aria-label={
              state.openOnly
                ? "모집중만 보기 — 켜짐. 눌러서 전체 보기"
                : "모집중만 보기 — 꺼짐. 눌러서 모집중만 보기"
            }
          >
            <span className={styles.track} aria-hidden="true">
              <span className={styles.knob} />
            </span>
            모집중만 보기
          </Link>
        </div>
      </Container>
    </form>
  );
}

/** 결과 줄 — 몇 건이 어떤 기준으로 정렬돼 있는지 */
export function ResultLine({ total, sort }: { total: number; sort: Sort }) {
  return (
    <div className={styles.listHead}>
      <p className={styles.count}>
        모두 <strong>{total}</strong>건 · {SORT_LABEL[sort]}
      </p>
    </div>
  );
}
