import { isSameOriginJson } from "./same-origin";

// 개인정보를 고치는 POST 의 겉껍데기(my-account INV-A6).
// - 같은 사이트의 JSON 요청만 받는다 — 다른 사이트가 로그인한 사람 몰래 고치지 못하게. 아니면 본문을 읽지도 않고 403.
// - 모든 응답(성공·실패)에 Cache-Control: no-store — 공용 컴퓨터·중간 캐시에 연락처가 남지 않게.
//   처리 함수가 예외를 던져도 500 을 여기서 만들어 no-store 를 붙인다(프레임워크 기본 오류 응답에는 붙지 않는다).

export type JsonReply = { status: number; body: Record<string, unknown> };

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** 다른 사이트에서 온 요청(403)과 처리 중 예외(500)에 내보내는 문구. 화면마다 문구를 다듬는 중이라 다듬은 화면은 copy 로 넘긴다. */
export type PrivateJsonCopy = { forbidden: string; failed: string };

const DEFAULT_COPY: PrivateJsonCopy = { forbidden: "잘못된 요청이에요.", failed: "처리하지 못했어요. 잠시 뒤 다시 해 주세요." };

/** 다듬은 문구(문구 2 다듬은본) — 가입·로그인·비밀번호 찾기 화면이 쓴다 */
export const REFINED_PRIVATE_JSON_COPY: PrivateJsonCopy = {
  forbidden: "유효하지 않은 요청입니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.",
  failed: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
};

export async function handlePrivateJsonPost(
  req: Request,
  run: (body: unknown) => Promise<JsonReply>,
  copy: PrivateJsonCopy = DEFAULT_COPY,
): Promise<Response> {
  if (!isSameOriginJson(req.headers)) {
    return Response.json({ message: copy.forbidden }, { status: 403, headers: NO_STORE });
  }
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  let reply: JsonReply;
  try {
    reply = await run(body);
  } catch (e) {
    console.error("private-json: 처리 중 예외", e instanceof Error ? e.name : typeof e);
    reply = { status: 500, body: { message: copy.failed } };
  }
  return Response.json(reply.body, { status: reply.status, headers: NO_STORE });
}
