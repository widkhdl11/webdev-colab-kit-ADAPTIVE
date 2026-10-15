import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { psql, signedInClient } from "./helpers";
import { deleteTestRevgifts, payTestRevgift, PROFILE, registerTestRevgift } from "./revgift-helpers";

// 크리에이터를 남에게 보여 줄 때는 공개 이름(creators.name)이다 — 가입 닉네임(profiles.nickname)은 계정마다 따로 있고
// 공개 이름과 다를 수 있다(signup INV-U13, 2026-10-15 크리에이터 닉네임을 공개 이름으로 덮던 처리 제거).
// 시험 동안 하루의 닉네임만 공개 이름과 다르게 바꿔 두고 끝나면 되돌린다.

const NICKNAME_DIFFERENT = "하루계정닉";
let originalNickname = "";

beforeAll(() => {
  deleteTestRevgifts();
  originalNickname = psql(`select nickname from public.profiles where id = '${PROFILE.haru}'`);
  psql(`update public.profiles set nickname = '${NICKNAME_DIFFERENT}' where id = '${PROFILE.haru}'`);
});

afterAll(() => {
  deleteTestRevgifts();
  psql(`update public.profiles set nickname = '${originalNickname}' where id = '${PROFILE.haru}'`);
});

function publicName(): string {
  return psql(`select name from public.creators where profile_id = '${PROFILE.haru}'`);
}

describe("크리에이터 이름은 공개 이름으로 보인다", () => {
  it("팬이 받은 역조공 목록의 보낸 크리에이터 이름은 공개 이름이다(닉네임이 아니다)", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(send);
    const { data, error } = await (await signedInClient("byeolbit_fan")).rpc("my_received_revgifts");
    expect(error).toBeNull();
    const row = (data as { order_no: string; creator_name: string }[]).find((r) => r.order_no === send.orderNos[0]);
    expect(publicName()).not.toBe(NICKNAME_DIFFERENT);
    expect(row?.creator_name).toBe(publicName());
  });

  it("운영자의 「확인 필요」 결제 목록에서 역조공을 낸 크리에이터는 공개 이름으로 보인다", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    psql(`update public.revgift_sends set status = 'confirming', confirming_at = now(), review_at = now() where id = '${send.sendId}'`);
    const { data, error } = await (await signedInClient("fankkuk_admin")).rpc("admin_review_payments");
    expect(error).toBeNull();
    const row = (data as { toss_order_id: string; payer_nickname: string }[]).find((r) => r.toss_order_id === send.tossOrderId);
    expect(row?.payer_nickname).toBe(publicName());
  });
});
