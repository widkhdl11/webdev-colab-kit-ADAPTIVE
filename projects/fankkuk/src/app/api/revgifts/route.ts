import type { NextRequest } from "next/server";
import { REVGIFT_SEND_CLOSED_MESSAGE } from "@/features/revgift-send/model/register-revgift";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 옛 역조공 보내기 등록 — 닫았다(revgift-box INV-GB22). 새 보내기를 만드는 길은 선물함 하나뿐이다(/creator/revgift-boxes/new).
// 세션·본문을 읽지 않고, DB 등록 함수(register_revgift)도 부르지 않는다. 닫기 전에 결제된 옛 보내기는 받기·6자리·환불이 옛 규칙대로 그대로 돈다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async () => ({ status: 410, body: { message: REVGIFT_SEND_CLOSED_MESSAGE, next: "/creator/revgift-boxes/new" } }));
}
