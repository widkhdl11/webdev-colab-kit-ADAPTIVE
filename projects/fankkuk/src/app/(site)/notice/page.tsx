import { permanentRedirect } from "next/navigation";

// 공지사항의 주소는 /notices 다. /notice 로 들어와도 같은 목록으로 보낸다.
export default function Page() {
  permanentRedirect("/notices");
}
