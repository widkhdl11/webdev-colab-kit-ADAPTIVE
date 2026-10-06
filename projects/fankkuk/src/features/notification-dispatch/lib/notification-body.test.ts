import { describe, expect, it } from "vitest";
import { buildNotificationBody, NOTIFICATION_KINDS, type NotificationBodyInput } from "./notification-body";

// 알림 본문 틀 (notifications INV-N1·N9). 본문은 잠금 화면·메일함·대행사 서버에 남는다 —
// 들어갈 수 있는 값은 종류·받는 사람 자신의 닉네임·주문번호·고정 경로, 승인 요청의 자동 반려 예정 시각뿐이다.

const ORIGIN = "https://fankkuk.example.com";
const base = { nickname: "하루", orderNo: "FC-7K3M9", appOrigin: ORIGIN } as const;

function inputFor(kind: NotificationBodyInput["kind"], round: 1 | 2 | 3 = 1): NotificationBodyInput {
  return { ...base, kind, round, autoRejectAt: kind === "approval_request" ? "2026-10-08T01:00:00Z" : null };
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
    for (const r of [1, 2, 3] as const) expect(buildNotificationBody(inputFor("approval_request", r)).text).toContain("꺼 두어도 가요");
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
    expect(paths.get("approval_request")!.pathname).toBe("/creator/requests");
    expect(paths.get("hold")!.pathname).toBe("/creator");
    for (const k of ["arrived", "inspected", "shipped"] as const) expect(paths.get(k)!.pathname).toBe("/gifts/FC-7K3M9");
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
