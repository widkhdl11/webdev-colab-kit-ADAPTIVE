import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readAdminVerifications, readMovingCreatorIds, readMyVerificationState } from "@/entities/creator/api/creator-verification-reads";
import { readVerificationEvents } from "@/entities/creator/api/read-admin-creators";
import { SenderRefusedError } from "@/entities/payment/api/payment-store";
import { createSupabasePaymentStore } from "@/entities/payment/api/supabase-payment-store";
import { as, createCvAccounts, CV, dropCvAccounts, reject, requestOk, resetCv, revoke, verifyVia, withdraw } from "./creator-verification-helpers";
import { adminClient, anonClient, SEED, signedInClient } from "./helpers";

// 크리에이터 본인 확인 — 화면(I2)이 쓰는 읽기와 서버 경로 (creator-verification INV-V9·V11·V12).
// DB 쓰기 함수의 규칙은 creator-verification-db 시험이 본다. 여기서는 화면이 기대는 읽기 함수와 응답 변환을 실제 DB 로 본다.

const YT = (h: string) => `https://www.youtube.com/@${h}`;

beforeAll(() => {
  createCvAccounts();
  resetCv();
});
beforeEach(() => resetCv());
afterAll(() => dropCvAccounts());

describe("채널 이사 중 안내 읽기 (INV-V12)", () => {
  it("INV-V12: 확인된 크리에이터가 새 채널로 신청하면 이사 중 목록에 오르고, 거두면 빠진다 — 로그인하지 않아도 읽는다", async () => {
    await verifyVia("haru", YT("scrmovex"));
    expect(await readMovingCreatorIds(anonClient())).not.toContain(CV.haru.creatorId);
    const y = await requestOk("haru", YT("scrmovey"));
    expect(await readMovingCreatorIds(anonClient())).toContain(CV.haru.creatorId);
    expect((await withdraw("haru", y.application_id)).error).toBeNull();
    expect(await readMovingCreatorIds(anonClient())).not.toContain(CV.haru.creatorId);
  });

  it("INV-V12 (실패경로): 확인 전 크리에이터의 첫 신청은 이사 중이 아니다", async () => {
    await requestOk("ggul", YT("scrfirst"));
    expect(await readMovingCreatorIds(anonClient())).not.toContain(CV.ggul.creatorId);
  });

  it("INV-V12 (S12): 앱 서버의 결제 저장소는 DB 의 「채널 이사 중」 거부를 이사 중 사유로 바꾼다", async () => {
    await verifyVia("haru", YT("scrstorex"));
    await requestOk("haru", YT("scrstorey"));
    const store = createSupabasePaymentStore(adminClient());
    const charge = { goodsKrw: 0, serviceFeeKrw: 1400, inspectionFeeKrw: 1500, shippingFeeKrw: 4000, totalKrw: 6900 };
    const attempt = store.create({
      orderId: `pay_test_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`,
      orderNo: `FC-T${crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`,
      charge,
      registration: { fanId: SEED.fanId, creatorId: CV.haru.creatorId, itemCategory: "other", itemOther: "시험 선물", hasElectronicsOrMetal: false, anniversaryName: null, boxes: ["small"] },
    });
    await expect(attempt).rejects.toBeInstanceOf(SenderRefusedError);
    await expect(attempt).rejects.toMatchObject({ reason: "moving" });
  });
});

describe("크리에이터 자신의 확인 상태 읽기 (INV-V7·V11)", () => {
  it("INV-V7: 승인 전에는 확인 안 됨·채널 없음, 승인 뒤에는 확인됨과 승인한 신청의 채널", async () => {
    const before = await readMyVerificationState(await as("ggul"));
    expect(before).toMatchObject({ creatorId: CV.ggul.creatorId, verified: false, platform: null, channelUrl: null, verifiedAt: null });
    await verifyVia("ggul", YT("scrstate"));
    const after = await readMyVerificationState(await as("ggul"));
    expect(after).toMatchObject({ verified: true, platform: "youtube", channelUrl: YT("scrstate") });
    expect(after?.verifiedAt).not.toBeNull();
  });

  it("INV-V11 (실패경로): 팬은 크리에이터 줄이 없어 null, 로그인하지 않았으면 실행 권한이 없다", async () => {
    expect(await readMyVerificationState(await signedInClient("byeolbit_fan"))).toBeNull();
    await expect(readMyVerificationState(anonClient())).rejects.toThrow();
  });
});

describe("운영자 화면 읽기 (INV-V9·V11)", () => {
  it("INV-V11: 운영자 신청 목록은 화면 모양으로 바뀌고, 연락처 칸이 없다 — 크리에이터·팬은 0줄", async () => {
    const a = await requestOk("ggul", YT("scradmin"));
    const rows = await readAdminVerifications(await as("fankkuk_staff"));
    const row = rows.find((r) => r.id === a.application_id);
    expect(row).toMatchObject({ loginId: CV.ggul.login, status: "issued", method: "code", code: a.code, channelUrl: YT("scradmin"), usedCount: 0 });
    expect(Object.keys(row ?? {})).not.toEqual(expect.arrayContaining(["phone", "email"]));
    expect(await readAdminVerifications(await as("ggul"))).toEqual([]);
    expect(await readAdminVerifications(await signedInClient("byeolbit_fan"))).toEqual([]);
  });

  it("INV-V9: 처리 기록 읽기는 반려·승인 취소를 사유 목록 값·메모·그때의 코드와 함께 돌려준다", async () => {
    const a = await requestOk("ggul", YT("scrlog"));
    expect((await reject(a.application_id, "channel_unreachable", "운영자 메모")).error).toBeNull();
    await verifyVia("summer", YT("scrlog2"));
    expect((await revoke(CV.summer.creatorId, "policy_violation", "")).error).toBeNull();
    const events = await readVerificationEvents(await as("fankkuk_staff"));
    expect(events.find((e) => e.creatorId === CV.ggul.creatorId && e.action === "reject")).toMatchObject({
      reasonCode: "channel_unreachable",
      reason: "운영자 메모",
      code: a.code,
      method: "code",
      channelUrl: YT("scrlog"),
    });
    expect(events.find((e) => e.creatorId === CV.summer.creatorId && e.action === "revoke")).toMatchObject({ reasonCode: "policy_violation" });
  });
});
