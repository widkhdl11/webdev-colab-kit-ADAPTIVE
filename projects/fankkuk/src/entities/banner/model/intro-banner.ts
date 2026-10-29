import type { BannerView } from "./banner";

// 사용자 선택 소개 이미지. 운영자가 등록하는 광고 데이터와 별개인 고정 사이트 소개다.
export const INTRO_BANNER: BannerView = {
  id: "fankkuk-introduction",
  title: "팬의 마음을, 크리에이터에게.",
  description: "승인된 선물을 검수 후 전달합니다.",
  link: "/about",
  isAd: false,
  imageUrl: "/images/banners/launch-01-introduction-no-button.png",
  imageOnly: true,
};
