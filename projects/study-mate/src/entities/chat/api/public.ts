// 슬라이스 밖으로 나가는 시그니처. `entities/study/api/public.ts` 와 같은 이유다 —
// 조회 함수가 검사를 위해 열어 둔 판독기 인자가 배럴로 그대로 나가면, 부르는 쪽이
// 어떤 클라이언트로 읽을지 고를 수 있게 된다. 「인가는 접근 정책이 한다」가 성립하는
// 근거가 **세션에 묶인 클라이언트**라서, 그 자리를 열어 두면 근거가 한 칸 약해진다.
//
// 이 슬라이스는 특히 그렇다 — 방이 보이는가·메시지가 보이는가를 전부 접근 정책이 판정하고
// 코드에는 그 판정이 한 줄도 없다.
//
// 검사는 같은 슬라이스 안에서 원본을 직접 import 한다 — 여기를 거치지 않는다.

import { readChatRoom as readChatRoomImpl, type ChatRoomPage } from "./read-chats";

export function readChatRoom(chatId: string, limit?: number): Promise<ChatRoomPage | null> {
  return readChatRoomImpl(chatId, limit);
}
