// 여러 entities 슬라이스가 함께 가리키는 크리에이터 화면 주소. 같은 주소를 슬라이스마다 따로 적으면 한쪽만 바뀌어 링크가 갈라진다 —
// 아래 레이어 한 곳에 두고 양쪽이 가져다 쓴다(FSD: 같은 레이어 슬라이스끼리는 서로 import 하지 않는다).

/** 크리에이터 승인 서명 연결하기(approval-signature INV-S16) — 상세 설정의 「승인 서명」 줄과 지금 할 일의 연결 줄이 여는 화면(signup INV-U20). */
export const CREATOR_SIGNATURE_LINK_PATH = "/creator/settings/signature";

/** 채널 만들기(signup INV-U21) — 가입 단계 화면(주소가 있으면 5단계, 없으면 4단계 배송지 등록부터 — INV-U22). 건너뛴 크리에이터는 지금 할 일의 「채널 만들기」 줄로 다시 온다. */
export const CREATOR_CHANNEL_CREATE_PATH = "/signup/creator";

/** 배송지 등록(signup INV-U22) — 주소 없는 크리에이터의 지금 할 일 「배송지 등록」 줄이 여는 곳. 설정 화면의 주소 칸이 펼쳐진다. */
export const CREATOR_ADDRESS_REGISTER_PATH = "/creator/settings#address";
