import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isMustDeliver } from "@/entities/notification/model/delivery-policy";
import { PHONE_CODE_VARIABLE } from "@/shared/api/phone-verifier/verifier";
import { ALIMTALK_KINDS, buildAlimtalkVariables } from "./alimtalk-body";
import type { NotificationBodyInput } from "./notification-body";

// 알림톡 템플릿 문서(docs/copy/alimtalk-templates.md)를 읽어 변수를 채운 본문이 우리가 기대하는 본문과 같은지 본다(notifications INV-N7).
// 문서의 본문·변수 이름과 코드가 어긋나면 여기서 깨진다 — 알림톡은 본문이 한 글자라도 다르면 대행사가 거부한다.

const DOC = readFileSync(join(process.cwd(), "docs/copy/alimtalk-templates.md"), "utf8").replace(/\r\n/g, "\n");

type Section = { body: string; button: string | null };

/** `## N. 이름 (`키`)` 절마다 첫 코드 블록 본문과 버튼 주소 */
function sections(): Map<string, Section> {
  const out = new Map<string, Section>();
  const parts = DOC.split(/^## /m).slice(1);
  for (const part of parts) {
    const key = /^[^\n]*\(`([^`]+)`\)/.exec(part)?.[1];
    const body = /```\n([\s\S]*?)\n```/.exec(part)?.[1];
    if (!key || body === undefined) continue;
    const button = /- 버튼: \[[^\]]+\] → `([^`]+)`/.exec(part)?.[1] ?? null;
    out.set(key, { body, button });
  }
  return out;
}

const placeholders = (text: string) => [...text.matchAll(/#\{[^}]+\}/g)].map((m) => m[0]);

function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/#\{[^}]+\}/g, (m) => {
    if (!(m in vars)) throw new Error(`변수 없음: ${m}`);
    return vars[m]!;
  });
}

function inputFor(kind: NotificationBodyInput["kind"], over: Partial<NotificationBodyInput> = {}): NotificationBodyInput {
  return {
    kind,
    round: 1,
    nickname: "하루",
    orderNo: "FC-7K3M9",
    autoRejectAt: kind === "approval_request" ? "2026-10-08T01:00:00Z" : null,
    undeliveredReason: null,
    senderName: null,
    disposeDueAt: null,
    approvalGift: kind === "approval_request" ? { senderNickname: "별빛", giftKind: "인형·쿠션", boxCount: 2 } : null,
    mustDeliver: isMustDeliver(kind),
    appOrigin: "https://fankkuk.com",
    ...over,
  };
}

const FAN_FOOTER = "선물 상세 정보는 알림에 표시하지 않습니다. 로그인 후 아래 버튼에서 확인해 주세요.\n알림 수신 여부는 ‘계정 설정 > 알림’에서 변경할 수 있습니다.";

/** 우리가 기대하는 본문 — 문서와 따로 적는다(둘 중 하나만 바뀌면 깨지게) */
const EXPECTED: Record<(typeof ALIMTALK_KINDS)[number], { body: string; button: string }> = {
  approval_request: {
    body: [
      "하루님, 승인 요청이 도착했어요.",
      "",
      "보낸 사람: 별빛",
      "선물: 인형·쿠션 2개",
      "주문번호: FC-7K3M9",
      "",
      "10월 8일 오전 10시까지 승인하지 않으면 자동 반려됩니다.",
      "",
      "서비스 이용에 필요한 필수 알림으로, 수신 설정과 관계없이 발송됩니다.",
    ].join("\n"),
    button: "https://fankkuk.com/creator/actions?order=FC-7K3M9",
  },
  box_arrived: { body: `하루님,\n보내신 상자 하나가 팬꾹에 도착했습니다.\n주문번호 FC-7K3M9\n\n${FAN_FOOTER}`, button: "https://fankkuk.com/gifts/FC-7K3M9" },
  shipped: {
    body: `하루님,\n보내신 선물이 팬꾹에서 출고 처리되었습니다. 택배사 인계 후 배송이 진행됩니다.\n주문번호 FC-7K3M9\n\n${FAN_FOOTER}`,
    button: "https://fankkuk.com/gifts/FC-7K3M9",
  },
  in_transit: { body: `하루님,\n보내신 선물이 배송 중입니다.\n주문번호 FC-7K3M9\n\n${FAN_FOOTER}`, button: "https://fankkuk.com/gifts/FC-7K3M9" },
  delivered: { body: `하루님,\n보내신 선물의 배송이 완료되었습니다.\n주문번호 FC-7K3M9\n\n${FAN_FOOTER}`, button: "https://fankkuk.com/gifts/FC-7K3M9" },
  gift_reply: { body: `하루님,\n보내신 선물에 답장이 도착했습니다.\n주문번호 FC-7K3M9\n\n${FAN_FOOTER}`, button: "https://fankkuk.com/gifts/FC-7K3M9" },
};

describe("INV-N7: 알림톡 변수를 채운 템플릿 문서의 본문 == 기대 본문", () => {
  const docs = sections();

  it("INV-N7: 문서에 본문이 있는 종류와 코드의 종류 목록이 같다", () => {
    const kinds = [...docs.keys()].filter((k) => k !== "SOLAPI_PHONE_CODE_TEMPLATE_ID");
    expect(kinds.sort()).toEqual([...ALIMTALK_KINDS].sort());
  });

  for (const kind of ALIMTALK_KINDS) {
    it(`INV-N7: ${kind} — 변수를 채우면 기대 본문·버튼 주소와 글자까지 같고, 문서에 없는 변수는 넘기지 않는다`, () => {
      const doc = docs.get(kind)!;
      const vars = buildAlimtalkVariables(inputFor(kind))!;
      expect(vars).not.toBeNull();
      expect(fill(doc.body, vars)).toBe(EXPECTED[kind].body);
      expect(fill(doc.button!, vars)).toBe(EXPECTED[kind].button);
      const used = new Set([...placeholders(doc.body), ...placeholders(doc.button!)]);
      expect(Object.keys(vars).sort()).toEqual([...used].sort());
    });
  }

  it("INV-C8: 역조공 상자 도착은 보낸 역조공 화면으로", () => {
    const vars = buildAlimtalkVariables(inputFor("box_arrived", { orderNo: "RG-7K3M9" }))!;
    expect(fill(docs.get("box_arrived")!.button!, vars)).toBe("https://fankkuk.com/creator/revgifts");
  });

  it("INV-U15: 인증번호 템플릿의 변수 이름이 코드와 같다", () => {
    const doc = docs.get("SOLAPI_PHONE_CODE_TEMPLATE_ID")!;
    expect(placeholders(doc.body)).toEqual([PHONE_CODE_VARIABLE]);
    expect(fill(doc.body, { [PHONE_CODE_VARIABLE]: "123456" })).toBe("[팬꾹] 인증번호 123456\n\n3분 안에 입력해 주세요.");
  });

  it("INV-N1 (실패경로): 승인 요청에 보낸 사람·종류·개수·기한 중 하나라도 없으면 변수를 만들지 않는다", () => {
    for (const over of [
      { approvalGift: null },
      { approvalGift: { senderNickname: " ", giftKind: "꽃", boxCount: 1 } },
      { approvalGift: { senderNickname: "별빛", giftKind: "", boxCount: 1 } },
      { approvalGift: { senderNickname: "별빛", giftKind: "꽃", boxCount: 0 } },
      { autoRejectAt: null },
    ]) {
      expect(buildAlimtalkVariables(inputFor("approval_request", over))).toBeNull();
    }
  });

  it("INV-N1: 승인 요청 말고는 보낸 사람·종류·개수를 넘기지 않는다(값을 넣어 와도)", () => {
    const vars = buildAlimtalkVariables(inputFor("shipped", { approvalGift: { senderNickname: "별빛", giftKind: "꽃", boxCount: 1 } }))!;
    expect(JSON.stringify(vars)).not.toMatch(/별빛|꽃/);
  });

  it("INV-N7 (실패경로): 템플릿 문서에 없는 종류는 null — 검수받지 않은 본문으로 보내지 않는다", () => {
    expect(buildAlimtalkVariables(inputFor("hold"))).toBeNull();
    expect(buildAlimtalkVariables(inputFor("revgift_offer", { senderName: "모모" }))).toBeNull();
  });
});
