import { redirect } from "next/navigation";

// 옛 역조공 보내기 화면 — 닫았다(revgift-box INV-GB22). 「팬에게 보내기」는 선물함 흐름 하나뿐이다.
// 옛 주소·옛 알림의 링크로 들어와도 선물함 1페이지(설명 → 만들기)로 보낸다. 보낸 역조공 목록(/creator/revgifts)은 그대로다.
export default function Page() {
  redirect("/creator/revgift-boxes/new");
}
