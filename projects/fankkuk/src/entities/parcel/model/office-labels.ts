import type { NextStep, OfficeTier, ParcelKind, ParcelState } from "./office-parcel";

// 사무실 상자의 화면 문구 (design-rules 8절·8-1, 시안 admin/parcels.html). 상태를 바꾸는 버튼 대신
// 「다음 단계」에 무엇을 스캔하면 되는지만 쓴다(office-workflow INV-W1).

export const KIND_LABEL: Record<ParcelKind, string> = { gift: "팬 선물", revgift: "역조공" };

export const TIER_LABEL: Record<OfficeTier, string> = { small: "소형", medium: "중형", large: "대형", oversize: "대형 초과" };

export type StateTone = "plain" | "warn" | "brand" | "ink";

export const STATE_LABEL: Record<ParcelState, { text: string; tone: StateTone }> = {
  no_waybill: { text: "송장 대기", tone: "plain" },
  awaiting: { text: "입고 대기", tone: "plain" },
  received: { text: "라벨 부착 대기", tone: "warn" },
  labeled: { text: "검수 대기", tone: "warn" },
  inspected: { text: "검수 완료", tone: "brand" },
  held: { text: "보관", tone: "ink" },
  return_waiting: { text: "반송 대기", tone: "warn" },
  return_printed: { text: "반송 송장 출력함", tone: "warn" },
  returned: { text: "반송함", tone: "ink" },
  label_printed: { text: "송장 출력함", tone: "brand" },
  shipped: { text: "출고함", tone: "plain" },
};

/** 목록의 「다음 단계」 칸. 빈 문자열이면 할 일이 없다. */
export const NEXT_STEP_TEXT: Record<NextStep, string> = {
  wait_waybill: "팬이 송장번호를 넣으면 입고할 수 있어요",
  scan_inbound: "원 송장을 스캔하면 입고돼요",
  confirm_label: "입고 화면에서 라벨 QR 스캔해 부착 확인",
  inspect: "검수 화면에서 QR 스캔 뒤 검수 기록",
  print_label: "출고 화면에서 QR 스캔",
  wait_approval: "크리에이터 승인을 기다려요",
  wait_accept: "팬의 받기를 기다려요",
  wait_expiry: "자동 처리 대기(반송 예정)",
  held: "추적 장치가 나와 사무실에 보관해요",
  print_return: "출고 화면에서 QR 스캔하면 반송 송장 출력",
  confirm_return: "출고 화면에서 반송 송장 바코드 스캔",
  confirm_shipment: "출고 화면에서 출력한 송장 바코드 스캔",
  done: "",
};
