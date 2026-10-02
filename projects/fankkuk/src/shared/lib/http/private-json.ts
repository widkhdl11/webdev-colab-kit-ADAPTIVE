import { isSameOriginJson } from "./same-origin";

// 개인정보를 고치는 POST 의 겉껍데기(my-account INV-A6).
// - 같은 사이트의 JSON 요청만 받는다 — 다른 사이트가 로그인한 사람 몰래 고치지 못하게. 아니면 본문을 읽지도 않고 403.
// - 모든 응답(성공·실패)에 Cache-Control: no-store — 공용 컴퓨터·중간 캐시에 연락처가 남지 않게.

export type JsonReply = { status: number; body: Record<string, unknown> };

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function handlePrivateJsonPost(req: Request, run: (body: unknown) => Promise<JsonReply>): Promise<Response> {
  if (!isSameOriginJson(req.headers)) {
    return Response.json({ message: "잘못된 요청이에요." }, { status: 403, headers: NO_STORE });
  }
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const reply = await run(body);
  return Response.json(reply.body, { status: reply.status, headers: NO_STORE });
}
