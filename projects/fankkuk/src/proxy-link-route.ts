import type { SupabaseClient } from "@supabase/supabase-js";
import { readCreatorCards } from "@/entities/creator/api/creator-reads";
import { readWithdrawnCreator, resolveCreatorHandle } from "@/entities/creator/api/creator-link-reads";
import { isHandleShape, linkRouteOf, oldPageRouteOf } from "@/entities/creator/model/creator-handle";

// 선물 링크 주소(/{아이디})와 옛 크리에이터 페이지 주소(/creators/{id})의 넘기기·없는 페이지를 응답 전에 정한다 (creator-link INV-E2·E3·E5).
// 왜 여기서: (site)/loading.tsx 가 페이지를 Suspense 로 감싸 응답(200)을 먼저 흘려보내므로, 페이지 안의 permanentRedirect()·notFound() 는
// 308·404 가 아니라 화면 안 이동·noindex 로 나간다(Next 문서 streaming 「The HTTP contract」). proxy 는 렌더 전이라 상태 코드를 정할 수 있다.
// 판정은 페이지와 같은 함수(resolveCreatorHandle·linkRouteOf·readCreatorCards·oldPageRouteOf·readWithdrawnCreator)로 한다 — 결과도 같다.
// - 대문자 주소는 DB 없이 소문자로 넘긴다. 정적 첫 단계 주소(/login 등)·점이 든 주소(파일·이미지)는 판정하지 않는다(DB 왕복 없음).
// - 탈퇴한 크리에이터는 페이지가 「탈퇴한 크리에이터입니다.」를 보여 주므로 그대로 넘긴다(approval-signature INV-S15).
// - 읽기가 실패하면 그대로 넘긴다 — 페이지가 같은 읽기를 다시 해 판정한다(전과 같은 동작).

/**
 * src/app 의 첫 단계 정적 주소(묶음 폴더 안 이름 포함). 이 주소는 링크 주소 칸([handle])보다 먼저 잡히므로 판정하지 않는다.
 * 폴더를 더하면 여기에도 더한다 — 폴더 목록과 같은지 proxy-link-route.test.ts 가 맞춰 본다.
 */
export const STATIC_FIRST_SEGMENTS: ReadonlySet<string> = new Set([
  "about",
  "admin",
  "api",
  "creator",
  "creators",
  "dispute",
  "faq",
  "gifts",
  "guide",
  "home",
  "inspection",
  "login",
  "me",
  "notice",
  "notices",
  "password",
  "pricing",
  "privacy",
  "refund",
  "report",
  "security",
  "signup",
  "support",
  "terms",
]);

export type LinkGate = { kind: "pass" } | { kind: "redirect"; to: string } | { kind: "not_found" };

const PASS: LinkGate = { kind: "pass" };
const ONE_SEGMENT = /^\/([^/]+)$/;
const OLD_PAGE = /^\/creators\/([^/]+)$/;

function decoded(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/** 주소 하나의 판정. client 는 판정에 DB 가 필요할 때만 만든다. */
export async function linkGateOf(pathname: string, client: () => Pick<SupabaseClient, "rpc">): Promise<LinkGate> {
  try {
    const one = ONE_SEGMENT.exec(pathname);
    if (one) return await handleGate(one[1], client);
    const old = OLD_PAGE.exec(pathname);
    if (old) return await oldPageGate(old[1], client);
    return PASS;
  } catch {
    return PASS;
  }
}

async function handleGate(raw: string, client: () => Pick<SupabaseClient, "rpc">): Promise<LinkGate> {
  const handle = decoded(raw);
  if (handle === null || handle.includes(".") || STATIC_FIRST_SEGMENTS.has(handle)) return PASS;
  // 대문자·꼴 틀림은 DB 없이 정해진다(linkRouteOf 가 찾기 결과를 보기 전에 판정한다)
  const early = linkRouteOf(handle, null);
  if (early.kind === "redirect") return early;
  if (!isHandleShape(handle)) return { kind: "not_found" };
  const db = client();
  const route = linkRouteOf(handle, await resolveCreatorHandle(db, handle));
  if (route.kind === "show") return PASS;
  if (route.kind === "redirect") return route;
  return (await readWithdrawnCreator(db, { handle })) ? PASS : { kind: "not_found" };
}

async function oldPageGate(raw: string, client: () => Pick<SupabaseClient, "rpc">): Promise<LinkGate> {
  const id = decoded(raw);
  if (id === null) return PASS;
  const db = client();
  const creator = (await readCreatorCards(db, { signedIn: false, onlyId: id }))[0];
  if (!creator) return (await readWithdrawnCreator(db, { creatorId: id })) ? PASS : { kind: "not_found" };
  const route = oldPageRouteOf(creator);
  return route.kind === "redirect" ? route : PASS;
}
