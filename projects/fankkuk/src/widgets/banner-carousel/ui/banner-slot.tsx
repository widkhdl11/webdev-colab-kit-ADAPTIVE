import type { ReactNode } from "react";
import type { BannerView } from "@/entities/banner/model/banner";
import { BannerCarousel } from "./banner-carousel";

// 라우트(서버)가 부르는 칸 — 읽지 못했거나(null) 0장이면 칸을 두지 않는다(docs/specs/banners.md INV-Y8).
// key: 브라우저 화면 부품(크리에이터 찾기)의 자식으로 넘어가면 React 가 key 를 요구한다.
// 넘김 부품은 브라우저 부품이라 그 파일의 함수를 서버에서 부를 수 없다 — 그래서 이 함수는 따로 둔다.
export function bannerSlot(banners: readonly BannerView[] | null): ReactNode {
  return banners && banners.length > 0 ? <BannerCarousel key="banner" banners={banners} /> : null;
}
