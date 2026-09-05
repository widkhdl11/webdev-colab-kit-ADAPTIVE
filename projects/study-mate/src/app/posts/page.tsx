import { readTopCategories } from "@/entities/category";
import { readUnreadNotificationCount } from "@/entities/notification";
import { readPosts, toSort } from "@/entities/post";
import { readRegions } from "@/entities/region";
import { currentUser } from "@/entities/session";
import { Container } from "@/shared/ui/container/Container";
import { Pager } from "@/shared/ui/pager/Pager";
import { SkipLink } from "@/shared/ui/skip-link/SkipLink";
import { buildQuery, parseList, parsePage } from "@/shared/lib/query";
import { PostFilters, ResultLine } from "@/widgets/post-filters";
import { PostGrid } from "@/widgets/post-grid";
import { SiteFooter } from "@/widgets/site-footer";
import { SiteHeader } from "@/widgets/site-header";

// 필터가 주소에 있으므로 요청마다 다른 화면이다.
export const dynamic = "force-dynamic";

type Params = { [key: string]: string | string[] | undefined };

const one = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;

  const state = {
    q: one(params.q) ?? "",
    categories: parseList(one(params.category)),
    region: one(params.region) ?? "",
    openOnly: one(params.open) === "1",
    sort: toSort(one(params.sort)),
  };
  const page = parsePage(one(params.page));

  const user = await currentUser();
  const [categories, regions, unread, result] = await Promise.all([
    readTopCategories(),
    readRegions(),
    user ? readUnreadNotificationCount() : Promise.resolve(0),
    readPosts({
      q: state.q,
      categories: state.categories,
      regionCode: state.region,
      openOnly: state.openOnly,
      sort: state.sort,
      page,
    }),
  ]);

  const pageHref = (n: number) =>
    `/posts${buildQuery({
      q: state.q,
      category: state.categories,
      region: state.region,
      open: state.openOnly ? "1" : undefined,
      sort: state.sort === "latest" ? undefined : state.sort,
      page: n > 1 ? n : undefined,
    })}`;

  return (
    <>
      <SkipLink />
      <SiteHeader signedIn={user !== null} unreadCount={unread} current="posts" />

      <main id="main">
        <PostFilters state={state} categories={categories} regions={regions} />

        <Container as="section">
          <ResultLine total={result.total} sort={state.sort} />
          <PostGrid
            posts={result.posts}
            empty={
              state.q || state.categories.length > 0 || state.region || state.openOnly
                ? "조건에 맞는 모집글이 없습니다. 필터를 하나 풀어 보세요."
                : "아직 모집글이 없습니다. 첫 스터디를 만들어 보세요."
            }
          />
          <Pager page={result.page} pageCount={result.pageCount} href={pageHref} />
        </Container>
      </main>

      <SiteFooter signedIn={user !== null} />
    </>
  );
}
