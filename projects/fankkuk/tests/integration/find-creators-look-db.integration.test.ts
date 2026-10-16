import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readCreatorSearchLooks } from "@/entities/creator/api/creator-reads";
import { CV, createCvAccounts, dropCvAccounts, resetCv, verifyVia } from "./creator-verification-helpers";
import { anonClient, psql } from "./helpers";

// 크리에이터 찾기 카드의 꾸민 모양(find_creators_look, 2026-10-16) — 카드 목록(find_creators)과 같은 사람만, 공개 칸 셋만.
// 크리에이터는 본인 확인 시험 계정(cvt_*). 확인은 실제 신청 → 코드 올림 → 운영자 승인 함수로 만든다.

const A = CV.haru;
const B = CV.summer;
const IDS = [A.creatorId, B.creatorId].map((id) => `'${id}'`).join(", ");
const BG = `${A.creatorId}/bg-3.webp`;
const SYM = `${A.creatorId}/sym-2.webp`;

function resetLook(): void {
  psql(`update public.creators set fan_name = null, bg_path = null, symbol_path = null, searchable = true where id in (${IDS});`);
}

beforeAll(() => {
  createCvAccounts();
});
beforeEach(() => {
  resetCv();
  resetLook();
});
afterAll(() => {
  resetLook();
  resetCv();
  dropCvAccounts();
});

describe("크리에이터 찾기 카드의 꾸민 모양", () => {
  it("본인 확인을 마치고 찾기 노출을 켠 크리에이터의 배경사진·팬덤 심볼·팬덤 이름이 로그인 없이 읽힌다", async () => {
    await verifyVia("haru", "https://www.youtube.com/@cvt-look-a");
    psql(`update public.creators set fan_name = '하루별', bg_version = 3, bg_path = '${BG}', symbol_version = 2, symbol_rights_at = now(), symbol_path = '${SYM}' where id = '${A.creatorId}';`);
    const looks = await readCreatorSearchLooks(anonClient());
    expect(looks[A.creatorId]).toEqual({ bgPath: BG, symbolPath: SYM, fanName: "하루별" });
  });

  it("본인 확인 전이면 나오지 않는다", async () => {
    psql(`update public.creators set fan_name = '여름단' where id = '${B.creatorId}';`);
    const looks = await readCreatorSearchLooks(anonClient());
    expect(looks[B.creatorId]).toBeUndefined();
  });

  it("찾기 노출을 끄면 나오지 않는다 — 카드 목록과 같은 사람만", async () => {
    await verifyVia("haru", "https://www.youtube.com/@cvt-look-a");
    psql(`update public.creators set searchable = false where id = '${A.creatorId}';`);
    expect((await readCreatorSearchLooks(anonClient()))[A.creatorId]).toBeUndefined();
    const cards = await anonClient().rpc("find_creators");
    expect((cards.data as { id: string }[]).some((r) => r.id === A.creatorId)).toBe(false);
  });

  it("돌려주는 칸은 id·배경사진·심볼·팬덤 이름 넷뿐이다", async () => {
    await verifyVia("haru", "https://www.youtube.com/@cvt-look-a");
    const { data, error } = await anonClient().rpc("find_creators_look");
    expect(error).toBeNull();
    const row = (data as Record<string, unknown>[]).find((r) => r.id === A.creatorId);
    expect(Object.keys(row ?? {}).sort()).toEqual(["bg_path", "fan_name", "id", "symbol_path"]);
  });
});
