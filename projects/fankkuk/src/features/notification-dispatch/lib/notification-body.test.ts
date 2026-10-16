import { describe, expect, it } from "vitest";
import { isMustDeliver } from "@/entities/notification/model/delivery-policy";
import { buildNotificationBody, NOTIFICATION_KINDS, type NotificationBodyInput } from "./notification-body";

// 알림 본문 틀 (notifications INV-N1·N9). 본문은 잠금 화면·메일함·대행사 서버에 남는다 —
// 들어갈 수 있는 값은 종류·받는 사람 자신의 닉네임·주문번호·고정 경로, 승인 요청의 자동 반려 예정 시각뿐이다.

const ORIGIN = "https://fankkuk.example.com";
const base = { nickname: "하루", orderNo: "FC-7K3M9", appOrigin: ORIGIN } as const;

function inputFor(kind: NotificationBodyInput["kind"], round: 1 | 2 | 3 = 1): NotificationBodyInput {
  return {
    ...base,
    kind,
    round,
    autoRejectAt: kind === "approval_request" ? "2026-10-08T01:00:00Z" : null,
    undeliveredReason: kind === "gift_undelivered" ? "declined" : null,
    // 역조공 받기(INV-N20)만 보낸 크리에이터 이름 하나를 받는다 — 다른 종류는 비어 있다
    senderName: kind === "revgift_offer" ? "모모" : null,
    mustDeliver: isMustDeliver(kind),
  };
}

const SENDABLE = NOTIFICATION_KINDS.filter((k) => k !== "in_transit" && k !== "delivered");

describe("알림 본문 틀 (INV-N1)", () => {
  it("INV-N1 (S1): 종류마다 주문번호·받는 사람 닉네임·링크만 — 품목·상대방·운송장·주소·전화·메일 꼴이 없다", () => {
    for (const kind of SENDABLE) {
      const b = buildNotificationBody(inputFor(kind));
      const all = [b.subject, b.text, b.buttonLabel, b.link].join("\n");
      expect(all).toContain("FC-7K3M9");
      expect(all).toContain("하루");
      for (const banned of ["향수", "별빛", "추적 장치", "블루투스"]) expect(all).not.toContain(banned);
      expect(all).not.toMatch(/01[016789]-?\d{3,4}-?\d{4}/); // 휴대폰 번호 꼴
      expect(all).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/); // 메일 주소 꼴
      expect(all).not.toMatch(/\d{10,}/); // 운송장 번호 꼴(숫자 열 자리 이상)
    }
  });

  it("INV-N1 (S1b): 틀은 정해진 칸 말고는 받지 않는다 — 다른 칸을 넘기면 타입 오류이고 본문에 섞이지 않는다", () => {
    const b = buildNotificationBody({
      ...inputFor("arrived"),
      // @ts-expect-error 본문 틀에는 품목·상대방·주소 칸이 없다
      itemName: "향수",
      senderNickname: "별빛",
      address: "서울시 어딘가 1",
    });
    expect([b.subject, b.text, b.buttonLabel, b.link].join("\n")).not.toMatch(/향수|별빛|서울시/);
  });

  it("INV-N1·N8: 승인 요청에만 자동 반려 예정 시각을 서울 시간으로 적는다", () => {
    const b = buildNotificationBody(inputFor("approval_request"));
    expect(b.text).toContain("10월 8일 오전 10시까지");
    const arrived = buildNotificationBody({ ...inputFor("arrived"), autoRejectAt: "2026-10-08T01:00:00Z" });
    expect(arrived.text).not.toContain("10월 8일");
  });

  it("INV-N8: 승인 요청은 차례마다 제목이 다르고, 셋 다 「꺼도 간다」는 안내를 붙인다", () => {
    const subjects = ([1, 2, 3] as const).map((r) => buildNotificationBody(inputFor("approval_request", r)).subject);
    expect(new Set(subjects).size).toBe(3);
    for (const r of [1, 2, 3] as const) expect(buildNotificationBody(inputFor("approval_request", r)).text).toContain("이 알림은 꺼 두어도 가요.");
    expect(buildNotificationBody(inputFor("arrived")).text).not.toContain("꺼 두어도 가요");
  });

  it("INV-N1: 승인 요청에 반려 시각이 없으면 만들지 않는다(기한 없는 승인 요청을 보내지 않는다)", () => {
    expect(() => buildNotificationBody({ ...inputFor("approval_request"), autoRejectAt: null })).toThrow();
  });

  it("INV-N3: 배송중·수령은 받는 사람(팬·크리에이터)마다 경로가 달라 아직 만들지 않는다 — 택배사 연결 때 정한다", () => {
    expect(() => buildNotificationBody(inputFor("in_transit"))).toThrow(/아직/);
    expect(() => buildNotificationBody(inputFor("delivered"))).toThrow(/아직/);
  });
});

describe("알림 링크 (INV-N9)", () => {
  it("INV-N9 (S9c): 링크는 설정의 사이트 주소 + 고정 경로(+주문번호)뿐 — 물음표 뒤 값도 조각도 없다", () => {
    const paths = new Map(SENDABLE.map((k) => [k, new URL(buildNotificationBody(inputFor(k)).link)]));
    for (const [, url] of paths) {
      expect(url.origin).toBe(ORIGIN);
      expect(url.search).toBe("");
      expect(url.hash).toBe("");
    }
    // 승인 요청·확인할 선물은 크리에이터 처리할 일(2026-10-16 — 「승인 대기」 메뉴가 없어짐, action-center INV-J5)
    expect(paths.get("approval_request")!.pathname).toBe("/creator/actions");
    expect(paths.get("creator_check")!.pathname).toBe("/creator/actions");
    expect(paths.get("hold")!.pathname).toBe("/creator");
    for (const k of ["arrived", "inspected", "shipped", "box_arrived"] as const) expect(paths.get(k)!.pathname).toBe("/gifts/FC-7K3M9");
  });

  it("INV-N13 (S13): 팬의 「돌려보낼 상자」 알림 — 선물 상세 링크, 보내신 주소로 돌려보낸다는 말뿐이고 무엇이 나왔는지·기다리는 시간은 없다", () => {
    const b = buildNotificationBody(inputFor("hold_fan"));
    expect(new URL(b.link).pathname).toBe("/gifts/FC-7K3M9");
    expect(b.subject).toBe("[팬꾹] 돌려보낼 상자가 있어요");
    expect(b.text).toContain("검수를 통과하지 못한 상자가 있어요.");
    expect(b.text).toContain("보내신 주소로 돌려보내요.");
    for (const word of ["추적", "블루투스", "금속", "크리에이터가", "168시간", "보관"]) expect(b.text).not.toContain(word);
  });

  it("INV-N13 (S13): 크리에이터의 추적기 반송 알림 — 확인을 부탁하지 않고 돌려보낸다는 사실, 무엇이 나왔는지·보낸 팬은 없다", () => {
    // 보낸 팬의 닉네임을 칸 밖으로 실제로 넘겨도 본문에 섞이지 않는다 — 넘기지 않으면 「별빛」 부재는 늘 참이다
    const b = buildNotificationBody({
      ...inputFor("hold"),
      // @ts-expect-error 본문 틀에는 보낸 팬 칸이 없다
      senderNickname: "별빛",
      fanNickname: "별빛",
    });
    expect(new URL(b.link).pathname).toBe("/creator");
    expect(b.subject).toBe("[팬꾹] 검수를 통과하지 못한 선물이 있어요");
    expect(b.text).toContain("검수를 통과하지 못해 보낸 분에게 돌려보내는 상자가 있어요.");
    for (const word of ["확인할", "확인이 필요한", "추적", "블루투스", "보관", "별빛"]) expect([word, b.text.includes(word) || b.subject.includes(word)]).toEqual([word, false]);
  });

  it("INV-N15 (S15): 도착하지 않은 상자 알림 — 선물 상세 링크, 30일이 지나면 닫히고 그 상자 금액을 돌려준다는 말뿐이다", () => {
    const b = buildNotificationBody({
      ...inputFor("box_missing"),
      // @ts-expect-error 본문 틀에는 받는 주소 칸이 없다
      addressCode: "K7M3XA",
    });
    expect(new URL(b.link).pathname).toBe("/gifts/FC-7K3M9");
    expect(b.subject).toBe("[팬꾹] 아직 도착하지 않은 상자가 있어요");
    expect(b.text).toContain("아직 도착하지 않은 상자가 있어요.");
    expect(b.text).toContain("결제하고 30일이 지나도 도착하지 않으면 그 상자는 닫히고 그 상자 금액을 돌려드려요.");
    expect(b.text).toContain("상자가 하나도 도착하지 않았다면 선물이 취소되고 결제 금액을 모두 돌려드려요.");
    expect(b.text).not.toContain("K7M3XA");
    expect(b.text).not.toMatch(/[3479ACDEFHJKMNPRTWXY]{6}/);
  });

  it("INV-N18 (S18): 차액 결제 요청 알림 — 선물 상세 링크, 추가 결제·결제 뒤 출고·7일 미납 반송이라는 말뿐이고 금액·크기는 없다", () => {
    const b = buildNotificationBody({
      ...inputFor("difference_due"),
      // @ts-expect-error 본문 틀에는 금액·구간 칸이 없다
      amountKrw: 2000,
      measuredTier: "medium",
    });
    expect(new URL(b.link).pathname).toBe("/gifts/FC-7K3M9");
    expect(b.subject).toBe("[팬꾹] 추가 결제가 필요한 상자가 있어요");
    expect(b.text).toContain("보내신 상자가 신청하신 크기보다 커서 추가 결제가 필요해요.");
    expect(b.text).toContain("추가 결제가 끝나면 크리에이터에게 보내 드려요.");
    expect(b.text).toContain("7일 안에 결제하지 않으면 보내신 주소로 돌려보내요.");
    expect(b.text).toContain("이 알림은 꺼 두어도 가요."); // 꼭 가는 알림이다(INV-N6, 2026-10-12)
    for (const word of ["2000", "2,000", "원", "중형", "medium", "소형", "대형"]) expect(b.text).not.toContain(word);
  });

  it("INV-N19 (S19): 첫 결제 전액 취소 안내 — 선물 등록 링크, 취소·돌려받는 기간·다시 등록이라는 말뿐이고 금액은 없다", () => {
    const b = buildNotificationBody(inputFor("payment_canceled"));
    expect(new URL(b.link).pathname).toBe("/gifts/new");
    expect(b.subject).toBe("[팬꾹] 결제를 취소했어요");
    expect(b.text).toContain("결제 금액을 확인하지 못해 결제를 모두 취소했어요.");
    expect(b.text).toContain("카드사에 따라 돌려받기까지 며칠 걸릴 수 있어요.");
    expect(b.text).toContain("선물을 보내시려면 다시 등록해 주세요.");
    expect(b.text).not.toMatch(/\d[\d,]*원/);
    expect(b.text).toContain("이 알림은 꺼 두어도 가요."); // 꼭 가는 알림이다(INV-N6, 2026-10-12)
  });

  it("INV-N19 (S19): 차액 결제 전액 취소 안내 — 선물 상세 링크, 추가 결제를 다시 해 달라는 말", () => {
    const b = buildNotificationBody(inputFor("difference_canceled"));
    expect(new URL(b.link).pathname).toBe("/gifts/FC-7K3M9");
    expect(b.text).toContain("결제 금액을 확인하지 못해 결제를 모두 취소했어요.");
    expect(b.text).toContain("추가 결제를 다시 해 주세요.");
    expect(b.text).not.toContain("다시 등록");
    expect(b.text).not.toMatch(/\d[\d,]*원/);
    expect(b.text).toContain("이 알림은 꺼 두어도 가요."); // 꼭 가는 알림이다(INV-N6, 2026-10-12)
  });

  it("INV-N17 (S17): 아직 안 온 상자 안내 — 선물 상세 링크, 택배비 뺀 금액을 먼저 돌려준다·늦게 오면 반송·7일 안에 안 오면 택배비도라는 말뿐이고 거절 종류·6자리는 없다", () => {
    const b = buildNotificationBody({
      ...inputFor("gift_pending_box"),
      // @ts-expect-error 본문 틀에는 받는 주소 칸이 없다
      addressCode: "K7M3XA",
    });
    expect(new URL(b.link).pathname).toBe("/gifts/FC-7K3M9");
    expect(b.subject).toBe("[팬꾹] 아직 도착하지 않은 상자가 있어요");
    expect(b.text).toContain("아직 도착하지 않은 상자가 있어요.");
    expect(b.text).toContain("택배비를 뺀 금액을 먼저 돌려드려요.");
    expect(b.text).toContain("이미 보내셨다면 도착하는 대로 돌려보내 드려요. 7일 안에 도착하지 않으면 택배비도 돌려드려요.");
    expect(b.text).not.toContain("1:1 문의");
    for (const word of ["거절", "반려", "차단", "K7M3XA"]) expect(b.text).not.toContain(word);
    expect(b.text).not.toMatch(/[3479ACDEFHJKMNPRTWXY]{6}/);
  });

  it("INV-N17 ② (S2) · decline-block INV-D5: 직접·차단 거절 알림 — 화면(C2)과 같은 「선물을 원하지 않아요」와 결제 금액을 돌려준다는 말, 차단·크리에이터 닉네임·6자리는 없다", () => {
    const b = buildNotificationBody({
      ...inputFor("gift_undelivered"),
      // @ts-expect-error 본문 틀에는 차단 칸이 없다 — 차단 거절도 사유 값은 declined 다(DB 가 주문 상태로만 정한다)
      byBlock: true,
      creatorNickname: "별빛",
    });
    expect(new URL(b.link).pathname).toBe("/gifts/FC-7K3M9");
    expect(b.subject).toBe("[팬꾹] 크리에이터가 선물을 원하지 않아요");
    expect(b.text).toContain("크리에이터가 선물을 원하지 않아요.");
    expect(b.text).toContain("결제 금액은 돌려드려요.");
    for (const word of ["차단", "기간", "반려", "별빛", "true"]) expect([word, b.text.includes(word) || b.subject.includes(word)]).toEqual([word, false]);
    expect(b.text).not.toMatch(/[3479ACDEFHJKMNPRTWXY]{6}/);
  });

  it("INV-N17 ② (S2) · decline-block INV-D5: 7일 자동 반려 알림 — 「기간이 지나 반려됐어요」와 결제 금액을 돌려준다는 말, 거절했다는 말은 없다", () => {
    const b = buildNotificationBody({ ...inputFor("gift_undelivered"), undeliveredReason: "expired" });
    expect(new URL(b.link).pathname).toBe("/gifts/FC-7K3M9");
    expect(b.subject).toBe("[팬꾹] 보낸 선물이 기간이 지나 반려됐어요");
    expect(b.text).toContain("보내신 선물이 기간이 지나 반려됐어요.");
    expect(b.text).toContain("결제 금액은 돌려드려요.");
    for (const word of ["원하지", "차단", "거절"]) expect([word, b.text.includes(word)]).toEqual([word, false]);
  });

  it("INV-N17 ② (실패경로): 사유 값이 없는 거절 알림은 만들지 않는다 — 어느 문구인지 모르는 채 보내지 않는다", () => {
    expect(() => buildNotificationBody({ ...inputFor("gift_undelivered"), undeliveredReason: null })).toThrow();
  });

  it("INV-N1 · INV-N13: 크리에이터의 「확인할 선물」 알림 — 받을지 정해 달라는 말과 7일 뒤 반송, 상대 닉네임·검출 내용은 없다(2026-10-12 (2) D3 ②)", () => {
    const b = buildNotificationBody({
      ...inputFor("creator_check"),
      // @ts-expect-error 본문 틀에는 보낸 팬·검출 내용 칸이 없다
      senderNickname: "별빛",
      detected: "블루투스",
    });
    expect(new URL(b.link).pathname).toBe("/creator/actions");
    expect(b.subject).toBe("[팬꾹] 받을지 정해 주실 선물이 있어요");
    expect(b.text).toContain("받을지 정해 주실 상자가 있어요.");
    expect(b.text).toContain("7일 안에 정하지 않으면 보낸 분에게 돌려보내요.");
    expect(b.text).toContain("이 알림은 꺼 두어도 가요.");
    for (const word of ["별빛", "블루투스", "RF", "추적", "전자"]) expect([word, b.text.includes(word) || b.subject.includes(word)]).toEqual([word, false]);
  });

  it("INV-N21 (S12): 코드 없이 온 상자 알림 — 「받는 주소 없이 보낸 상자가 있어요」(용어집)와 「받는 주소 없이 보냈어요」 화면(선물 상세) 링크뿐, 꼭 가는 알림", () => {
    const b = buildNotificationBody(inputFor("box_no_code"));
    expect(b.subject).toBe("[팬꾹] 받는 주소 없이 보낸 상자가 있어요");
    expect(b.buttonLabel).toBe("받는 주소 없이 보냈어요");
    expect(new URL(b.link).pathname).toBe("/gifts/FC-7K3M9");
    const lines = b.text.split("\n");
    // 인사 · 문구 한 줄 · (빈 줄) · 링크 · (빈 줄) · 공통 꼬리말 · 꺼도 간다는 안내 — 주문번호 줄·도착일·기한 문장은 없다
    expect(lines.slice(0, 2)).toEqual(["하루님,", "받는 주소 없이 보낸 상자가 있어요."]);
    expect(lines[3]).toBe(b.link);
    expect(b.text).toContain("이 알림은 꺼 두어도 가요.");
    expect(b.text).not.toContain("주문번호");
    for (const word of ["송장", "택배", "CJ", "도착한", "크리에이터"]) expect([word, b.text.includes(word)]).toEqual([word, false]);
  });

  it("INV-N6: 꼭 가는 알림에는 「꺼 두어도 가요」, 끌 수 있는 알림에는 「끌 수 있어요」 — 종류별 표 그대로", () => {
    for (const kind of SENDABLE) {
      const text = buildNotificationBody(inputFor(kind)).text;
      const must = isMustDeliver(kind);
      expect([kind, text.includes("이 알림은 꺼 두어도 가요.")]).toEqual([kind, must]);
      expect([kind, text.includes("알림은 내 팬꾹에서 끌 수 있어요.")]).toEqual([kind, !must]);
    }
  });

  it("INV-N6: 「꺼 두어도 가요」는 꺼낸 줄의 꼭 가는 알림 표시(DB 판정)를 따른다 — 앱 목록과 달라도 줄의 값대로", () => {
    expect(buildNotificationBody({ ...inputFor("arrived"), mustDeliver: true }).text).toContain("이 알림은 꺼 두어도 가요.");
    const optional = buildNotificationBody({ ...inputFor("difference_due"), mustDeliver: false }).text;
    expect(optional).not.toContain("꺼 두어도 가요");
    expect(optional).toContain("알림은 내 팬꾹에서 끌 수 있어요.");
  });

  it("INV-N6: 끌 수 있는 알림의 안내는 받는 사람의 설정 자리를 가리킨다 — 팬은 내 팬꾹, 크리에이터는 주소와 설정", () => {
    expect(buildNotificationBody(inputFor("shipped")).text).toContain("알림은 내 팬꾹에서 끌 수 있어요.");
    // 역조공 상자 도착은 보낸 크리에이터가 받는다
    const revgift = buildNotificationBody({ ...inputFor("box_arrived"), orderNo: "RG-7K3M9" }).text;
    expect(revgift).toContain("알림은 내 팬꾹의 주소와 설정에서 끌 수 있어요.");
    const creator = buildNotificationBody({ ...inputFor("approval_request"), mustDeliver: false }).text;
    expect(creator).toContain("알림은 내 팬꾹의 주소와 설정에서 끌 수 있어요.");
    for (const kind of SENDABLE) expect(buildNotificationBody(inputFor(kind)).text).not.toContain("내 정보에서");
  });

  it("INV-C8: 역조공 상자 도착 알림은 보낸 크리에이터의 「보낸 역조공」 화면으로 잇는다", () => {
    const b = buildNotificationBody({ ...inputFor("box_arrived"), orderNo: "RG-7K3M9" });
    expect(new URL(b.link).pathname).toBe("/creator/revgifts");
  });

  it("INV-C2 (S2b): 상자 도착 알림 본문에 받는 주소 6자리·사무실 주소가 없다 — 틀에 그 칸이 없다", () => {
    const b = buildNotificationBody({
      ...inputFor("box_arrived"),
      // @ts-expect-error 본문 틀에는 받는 주소 칸이 없다
      addressCode: "K7M3XA",
    });
    const all = [b.subject, b.text, b.buttonLabel, b.link].join(" ");
    expect(all).not.toContain("K7M3XA");
    expect(all).not.toMatch(/[3479ACDEFHJKMNPRTWXY]{6}/);
    expect(all).not.toMatch(/강남구|검수센터/);
  });

  it("INV-N9 (실패경로): 주문번호 꼴이 아닌 값은 경로에 넣지 않는다 — 경로를 바꾸는 글자로 다른 화면을 가리키게 할 수 없다", () => {
    for (const orderNo of ["../admin", "FC-1?x=1", "FC-1#a", "fc 1", "", `FC-${"A".repeat(38)}`]) {
      expect(() => buildNotificationBody({ ...inputFor("arrived"), orderNo })).toThrow(/주문번호/);
    }
  });

  it("INV-N9 (실패경로): 사이트 주소가 경로 없는 주소가 아니면 만들지 않는다", () => {
    for (const appOrigin of ["https://fankkuk.example.com/evil", "fankkuk", "javascript:alert(1)", "ftp://fankkuk.example.com"]) {
      expect(() => buildNotificationBody({ ...inputFor("arrived"), appOrigin })).toThrow(/사이트 주소/);
    }
  });
});

describe("받았어요·답장 알림 (gift-reply INV-G5)", () => {
  it("INV-G5 S5: gift_reply 는 「답장이 왔어요」, gift_received 는 「보낸 선물이 도착했다고 확인됐어요」 — 선물 상세로 잇는다", () => {
    const reply = buildNotificationBody(inputFor("gift_reply"));
    expect(reply.subject).toBe("[팬꾹] 보낸 선물에 답장이 왔어요");
    expect(reply.text).toContain("답장이 왔어요");
    expect(reply.link).toBe(`${ORIGIN}/gifts/FC-7K3M9`);
    const received = buildNotificationBody(inputFor("gift_received"));
    expect(received.subject).toBe("[팬꾹] 보낸 선물이 도착했다고 확인됐어요");
    expect(received.text).not.toContain("답장");
    expect(received.link).toBe(`${ORIGIN}/gifts/FC-7K3M9`);
  });

  it("INV-G5 (실패경로): 크리에이터 이름·답장 내용을 넘겨도 본문에 섞이지 않는다 — 틀에 그 칸이 없다", () => {
    for (const kind of ["gift_reply", "gift_received"] as const) {
      const b = buildNotificationBody({
        ...inputFor(kind),
        // @ts-expect-error 본문 틀에는 크리에이터 이름·답장 칸이 없다
        creatorName: "하루시험",
        replyLine: "손편지 읽고 울컥했어요",
      });
      expect([b.subject, b.text, b.buttonLabel, b.link].join("\n")).not.toMatch(/하루시험|손편지|울컥/);
    }
  });
});

describe("역조공 받기 알림 (INV-N20 · reverse-gift INV-R12)", () => {
  const offer = (round: 1 | 2, senderName: string | null = "모모"): NotificationBodyInput => ({
    ...inputFor("revgift_offer"),
    orderNo: "RG-7K3M90",
    round,
    senderName,
  });

  it("INV-N20 (S20): 본문은 보낸 크리에이터 이름과 그 몫 받기 화면 링크뿐 — 주문번호 줄·상자 크기·금액이 없다, 꺼도 간다", () => {
    const b = buildNotificationBody(offer(1));
    expect(new URL(b.link).pathname).toBe("/me/revgifts/RG-7K3M90");
    expect(b.subject).toContain("모모");
    expect(b.text).toContain("모모님");
    expect(b.text).not.toContain("주문번호");
    expect(b.text).not.toMatch(/소형|중형|대형|\d{1,3},\d{3}/);
    expect(b.text).toContain("이 알림은 꺼 두어도 가요.");
  });

  it("INV-N20 (S20b): 72시간 재알림은 제목이 다르다", () => {
    expect(buildNotificationBody(offer(2)).subject).not.toBe(buildNotificationBody(offer(1)).subject);
  });

  it("INV-N20 (실패경로): 보낸 크리에이터 이름이 없으면 만들지 않는다 — 누가 보냈는지 모르면 받을지 정할 수 없다", () => {
    expect(() => buildNotificationBody(offer(1, null))).toThrow();
    expect(() => buildNotificationBody(offer(1, "  "))).toThrow();
  });

  it("INV-N1 (실패경로): 다른 종류에는 보낸 크리에이터 이름을 넘겨도 본문에 섞이지 않는다", () => {
    for (const kind of SENDABLE.filter((k) => k !== "revgift_offer")) {
      const b = buildNotificationBody({ ...inputFor(kind), senderName: "모모" });
      expect([kind, [b.subject, b.text].join("\n").includes("모모")]).toEqual([kind, false]);
    }
  });
});

describe("받는 주소 없이 보낸 상자 알림 — 크리에이터 (INV-N21 · 카드 d96 ③)", () => {
  it("INV-N21: 몫 번호(RG-)를 가리키는 줄은 보낸 역조공 화면의 「내 상자 찾기」로 잇고, 본문은 같은 한 줄뿐", () => {
    const b = buildNotificationBody({ ...inputFor("box_no_code"), orderNo: "RG-7K3M90" });
    expect(new URL(b.link).pathname).toBe("/creator/revgifts");
    expect(b.buttonLabel).toBe("내 상자 찾기");
    expect(b.text.split("\n").slice(0, 2)).toEqual(["하루님,", "받는 주소 없이 보낸 상자가 있어요."]);
    expect(b.text).not.toContain("RG-7K3M90");
    expect(b.text).toContain("이 알림은 꺼 두어도 가요.");
  });

  it("INV-N21 (실패경로): 팬 선물 주문이면 지금처럼 선물 상세의 「받는 주소 없이 보냈어요」로", () => {
    const b = buildNotificationBody(inputFor("box_no_code"));
    expect(new URL(b.link).pathname).toBe("/gifts/FC-7K3M9");
    expect(b.buttonLabel).toBe("받는 주소 없이 보냈어요");
  });
});
