import { describe, expect, it } from "vitest";
import { sealedAddressPlaintext, readOpenedRevgiftAddress } from "./sealed-address";
import { isRevgiftOrderNo, newRevgiftOrderNo, revgiftQrContent } from "./revgift-order-no";
import { buildRevgiftNotice } from "./revgift-notice";
import { parseSentRows, parseReceivedRows } from "./revgift-rows";

const ADDRESS = {
  orderNo: "RG-ABC123",
  recipientName: "김별빛",
  phone: "01012345678",
  zipCode: "04001",
  address1: "서울 마포구 어울마당로 1",
  address2: "101동 1001호",
};

describe("역조공 주문번호", () => {
  it("새 번호는 RG- 로 시작하고 팬 선물 번호(FC-)와 섞이지 않는다", () => {
    const no = newRevgiftOrderNo();
    expect(isRevgiftOrderNo(no)).toBe(true);
    expect(no.startsWith("RG-")).toBe(true);
    expect(isRevgiftOrderNo("FC-7K3M9")).toBe(false);
    expect(isRevgiftOrderNo("RG-abc")).toBe(false);
  });
});

describe("INV-R5: 2026-10-17 전 봉인 — 주문번호가 묶인 몫은 계속 열린다", () => {
  it("INV-R5: 봉인할 내용에는 주소·받는 사람 이름·전화번호와 그 몫의 주문번호가 함께 들어간다", () => {
    const plain = JSON.parse(sealedAddressPlaintext(ADDRESS)) as Record<string, unknown>;
    expect(plain).toEqual({ v: 1, ...ADDRESS });
  });

  it("INV-R5 (실패경로): 주문번호·이름·전화·주소 중 하나라도 비었거나 꼴이 틀리면 봉인할 내용을 만들지 않는다", () => {
    expect(() => sealedAddressPlaintext({ ...ADDRESS, orderNo: "FC-7K3M9" })).toThrow();
    expect(() => sealedAddressPlaintext({ ...ADDRESS, recipientName: " " })).toThrow();
    expect(() => sealedAddressPlaintext({ ...ADDRESS, phone: "02-123" })).toThrow();
    expect(() => sealedAddressPlaintext({ ...ADDRESS, address1: "" })).toThrow();
  });

  it("INV-R5·R7 (b): 연 내용에서 주문번호를 꺼낸다 — 꼴이 틀리면 null", () => {
    const { orderNo, ...label } = ADDRESS;
    expect(readOpenedRevgiftAddress(sealedAddressPlaintext(ADDRESS))).toEqual({ orderNo, label });
    expect(readOpenedRevgiftAddress("서울 마포구")).toBeNull();
    expect(readOpenedRevgiftAddress(JSON.stringify({ v: 1, orderNo: "FC-7K3M9" }))).toBeNull();
  });
});

describe("INV-R8: 크리에이터용 보낸 목록은 정해진 칸만 받는다", () => {
  const row = { order_no: "RG-ABC123", sent_at: "2026-10-03T00:00:00+00:00", fan_nickname: "별빛", tier: "small", state: "waiting", ship_to_office: true };

  it("INV-R8 S8: 정해진 칸의 줄은 화면 값으로 바뀐다", () => {
    expect(parseSentRows([row])).toEqual([
      { orderNo: "RG-ABC123", sentAt: "2026-10-03T00:00:00+00:00", fanNickname: "별빛", tier: "small", state: "waiting", shipToOffice: true },
    ]);
  });

  it("INV-R14 (실패경로): 사무실로 보낼 상자가 남았는지 칸이 없거나 참·거짓이 아니면 목록 전체를 버린다", () => {
    const { ship_to_office: _dropped, ...without } = row;
    expect(() => parseSentRows([without])).toThrow();
    expect(() => parseSentRows([{ ...row, ship_to_office: "true" }])).toThrow();
  });

  it("INV-R8 (실패경로): 팬 로그인 아이디 칸이 섞여 오면 목록 전체를 버린다 — 크리에이터는 닉네임만 본다", () => {
    expect(() => parseSentRows([{ ...row, fan_login_id: "byeolbit_fan" }])).toThrow();
  });

  it("INV-R8 (실패경로): 주소·실명·전화·운송장 같은 칸이 섞여 오면 목록 전체를 버린다", () => {
    expect(() => parseSentRows([{ ...row, address: "서울" }])).toThrow();
    expect(() => parseSentRows([{ ...row, waybill_no: "612345678901" }])).toThrow();
  });

  it("INV-R8 S8b (실패경로): 상태는 세 가지뿐 — 거절·기한 지남이 따로 오면 받지 않는다", () => {
    expect(() => parseSentRows([{ ...row, state: "declined" }])).toThrow();
    expect(() => parseSentRows([{ ...row, state: "expired" }])).toThrow();
  });

  it("팬 본인 목록은 거절과 기한 지남을 나눠 받는다", () => {
    const received = { order_no: "RG-ABC123", creator_name: "하루", tier: "small", reply: "expired", deadline: "2026-10-10T00:00:00+00:00", shipped: false, returned: false, cancelled: false };
    expect(parseReceivedRows([received])[0]?.reply).toBe("expired");
    expect(() => parseReceivedRows([{ ...received, reply: "unknown" }])).toThrow();
  });

  it("INV-W15: 처분 표시(disposed)를 받는다 — 읽기 함수가 아직 옛것이라 칸이 없으면 처분 아님", () => {
    const received = { order_no: "RG-ABC123", creator_name: "하루", tier: "small", reply: "accepted", deadline: "2026-10-10T00:00:00+00:00", shipped: false, returned: true, cancelled: false };
    expect(parseReceivedRows([{ ...received, disposed: true }])[0]?.disposed).toBe(true);
    expect(parseReceivedRows([received])[0]?.disposed).toBe(false);
    expect(() => parseReceivedRows([{ ...received, disposed: "yes" }])).toThrow();
  });
});

describe("INV-R12: 팬 알림과 QR 에는 주소가 들어가지 않는다", () => {
  it("INV-R12 S12: 알림에는 보낸 크리에이터 이름과 받기 링크만 있다", () => {
    expect(buildRevgiftNotice({ creatorName: "하루", orderNo: "RG-ABC123" })).toEqual({
      text: "하루님이 보낸 선물입니다. 수령 여부를 선택해 주세요.",
      link: "/gifts/RG-ABC123#todo",
    });
  });

  it("INV-R12 (실패경로): 주문번호 꼴이 아니면 알림을 만들지 않는다 — 다른 값이 링크에 섞이지 않는다", () => {
    expect(() => buildRevgiftNotice({ creatorName: "하루", orderNo: "RG-ABC123/../../x" })).toThrow();
  });

  it("INV-R12: QR 내용은 몫 주문번호와 정확히 같다", () => {
    expect(revgiftQrContent("RG-ABC123")).toBe("RG-ABC123");
    expect(() => revgiftQrContent("RG-ABC123 서울")).toThrow();
  });
});
