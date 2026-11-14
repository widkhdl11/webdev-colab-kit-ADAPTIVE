import { redirect } from "next/navigation";
import { creatorProfileTabHref } from "@/entities/session/model/home-path";

// 옛 「내 팬꾹 꾸미기」 주소 — 2026-11-14 사용자 결정으로 메뉴를 없애고 두 구역(링크 미리보기 이미지 · 공지 이미지 다운로드)을
// 프로필 수정 「채널」 탭으로 옮겼다(DECISIONS 같은 날). 북마크·예전 안내 링크가 빈 화면으로 열리지 않게 그 구역으로 넘긴다.
// 로그인·역할 확인은 넘어간 화면(/creator/profile)이 한다.
export default function Page() {
  redirect(`${creatorProfileTabHref("channel")}#preview-image`);
}
