// `readChatRoom` 은 **판독기 인자를 뺀 시그니처로** 다시 내보낸다 — 이유는
// `api/public.ts` 에 적었다. `readMyChats` 는 아직 그 인자가 없어서 원본 그대로 나간다.
export { readChatRoom } from "./api/public";
export {
  readMyChats,
  type ChatMessage,
  type ChatRoom,
  type ChatRoomPage,
  type ChatStudy,
} from "./api/read-chats";
