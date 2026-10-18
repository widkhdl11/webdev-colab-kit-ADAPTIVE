// 파스텔 8색 — design-rules 00000절 「사진 없는 배너」. 크리에이터 카드의 기본 바탕(entities/creator/lib/cover-pastel)과
// 광고 배너 장의 바탕(entities/banner — 보이는 순서대로 돌려 쓴다, design-rules 16절 ②)이 같은 목록·같은 순서를 쓴다.

export const PASTEL_TONES = ["#FDE2E4", "#FFE5CC", "#FFF1B8", "#DFF5D8", "#D3F0EC", "#DCEBFF", "#E6E0FF", "#F6DFF0"] as const;

export type PastelTone = (typeof PASTEL_TONES)[number];
