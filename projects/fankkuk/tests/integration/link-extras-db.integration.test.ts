import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readCreatorLinkExtras } from "@/entities/creator/api/creator-link-reads";
import { NO_LOOK } from "@/entities/creator/model/link-images";
import { readMyCreatorSettings } from "@/entities/creator/api/my-creator-settings";
import { loadCreatorLinkPage } from "@/widgets/creator-profile/api/load-creator-link";
import { CreatorProfilePage } from "@/widgets/creator-profile/ui/creator-profile-page";
import { CV, createCvAccounts, dropCvAccounts, resetCv, revoke, verifyVia } from "./creator-verification-helpers";
import { anonClient, psql, signedInClient } from "./helpers";

// 추가분 4-1(팬을 부르는 이름)·4-3/4-4/4-5(확인된 채널의 공개 정보) — DB 함수와 링크 페이지 읽기.
// 크리에이터는 본인 확인 시험 계정(cvt_*). 확인은 실제 신청 → 코드 올림 → 운영자 승인 함수로 만든다(승인 기록 날짜가 확인 날짜가 된다).

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }) }));

const A = CV.haru;
const B = CV.summer;
const IDS = Object.values(CV).map((c) => `'${c.creatorId}'`).join(", ");
const YT_KEY = "cvt-fanname-a";

function resetFanNames(): void {
  psql(`update public.creators set fan_name = null, intro = '' where id in (${IDS});`);
}

async function saveProfile(login: string, fanName?: string) {
  const name = Object.values(CV).find((c) => c.login === login)?.name ?? "시험";
  const args: Record<string, unknown> = { p_name: name, p_intro: "", p_searchable: true };
  if (fanName !== undefined) args.p_fan_name = fanName;
  return (await signedInClient(login)).rpc("update_my_creator_profile", args);
}

function fanNameOf(creatorId: string): string {
  return psql(`select coalesce(fan_name, '<null>') from public.creators where id = '${creatorId}'`);
}

beforeAll(() => {
  createCvAccounts();
});
beforeEach(() => {
  resetCv();
  resetFanNames();
});
afterAll(() => {
  resetFanNames();
  resetCv();
  dropCvAccounts();
});

describe("팬을 부르는 이름 — 저장 (추가분 4-1)", () => {
  it("본인 것만 저장되고, 앞뒤 공백을 빼고, 본인 설정 읽기에 나온다", async () => {
    expect((await saveProfile(A.login, "  꿀벌단 ")).error).toBeNull();
    expect(fanNameOf(A.creatorId)).toBe("꿀벌단");
    expect(fanNameOf(B.creatorId)).toBe("<null>");
    const mine = await readMyCreatorSettings(await signedInClient(A.login));
    expect(mine?.fanName).toBe("꿀벌단");
  });

  it("칸을 보내지 않으면 그대로 두고, 빈 문자열이면 지운다", async () => {
    await saveProfile(A.login, "꿀벌단");
    expect((await saveProfile(A.login)).error).toBeNull();
    expect(fanNameOf(A.creatorId)).toBe("꿀벌단");
    expect((await saveProfile(A.login, "   ")).error).toBeNull();
    expect(fanNameOf(A.creatorId)).toBe("<null>");
  });

  it("10자(이모지 한 글자 포함)는 받는다", async () => {
    expect((await saveProfile(A.login, "가".repeat(9) + "🎁")).error).toBeNull();
    expect(fanNameOf(A.creatorId)).toBe("가".repeat(9) + "🎁");
  });

  it("(실패경로) 11자·줄바꿈·보이지 않는 글자는 22023, 값은 그대로", async () => {
    await saveProfile(A.login, "꿀벌단");
    for (const bad of ["가".repeat(11), "꿀벌\n단", "꿀​벌"]) {
      expect([bad, (await saveProfile(A.login, bad)).error?.code]).toEqual([bad, "22023"]);
    }
    expect(fanNameOf(A.creatorId)).toBe("꿀벌단");
  });

  it("(실패경로) 이미 있는 욕설·연락처 필터를 그대로 쓴다 — 금칙어 P0084 · 연락처 P0085 · 기호만 P0086", async () => {
    for (const [bad, code] of [
      ["시발단", "P0084"],
      ["0101234567", "P0085"],
      ["!!!", "P0086"],
    ] as const) {
      expect([bad, (await saveProfile(A.login, bad)).error?.code]).toEqual([bad, code]);
    }
    expect(fanNameOf(A.creatorId)).toBe("<null>");
  });

  it("(실패경로) 팬 계정·로그인 안 함은 저장하지 못한다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("update_my_creator_profile", { p_name: "팬", p_intro: "", p_searchable: true, p_fan_name: "팬덤" })).error?.code).toBe("42501");
    expect((await anonClient().rpc("update_my_creator_profile", { p_name: "팬", p_intro: "", p_searchable: true, p_fan_name: "팬덤" })).error).not.toBeNull();
  });
});

describe("확인된 채널의 공개 읽기 — creator_link_extras (추가분 4-3·4-4·4-5)", () => {
  it("본인 확인된 크리에이터: 플랫폼·채널 키·주소·확인 날짜(한국 시간 오늘)와 팬덤 이름만, 로그인하지 않아도 읽힌다", async () => {
    await verifyVia("haru", `https://www.youtube.com/@${YT_KEY}`);
    await saveProfile(A.login, "꿀벌단");
    const raw = await anonClient().rpc("creator_link_extras", { p_creator_id: A.creatorId });
    expect(raw.error).toBeNull();
    const rows = raw.data as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    // 운영자 메모·인증 코드·신청·계정 칸은 없다
    expect(Object.keys(rows[0]!).sort()).toEqual(["bg_path", "channel_key", "channel_url", "fan_name", "platform", "preview_pick", "symbol_path", "verified_on"]);
    const today = psql(`select (now() at time zone 'Asia/Seoul')::date::text`);
    expect(await readCreatorLinkExtras(anonClient(), A.creatorId)).toEqual({
      fanName: "꿀벌단",
      channel: { platform: "youtube", channelKey: YT_KEY, channelUrl: `https://www.youtube.com/@${YT_KEY}`, verifiedOn: today },
      look: NO_LOOK,
    });
  });

  it("(실패경로) 본인 확인 전·승인 취소된 크리에이터는 빈 목록 — 팬덤 이름도 나오지 않는다", async () => {
    await saveProfile(B.login, "여름단");
    expect((await anonClient().rpc("creator_link_extras", { p_creator_id: B.creatorId })).data).toEqual([]);
    await verifyVia("haru", `https://www.youtube.com/@${YT_KEY}`);
    expect(((await anonClient().rpc("creator_link_extras", { p_creator_id: A.creatorId })).data as unknown[]).length).toBe(1);
    expect((await revoke(A.creatorId)).error).toBeNull();
    expect((await anonClient().rpc("creator_link_extras", { p_creator_id: A.creatorId })).data).toEqual([]);
    expect(await readCreatorLinkExtras(anonClient(), A.creatorId)).toEqual({ fanName: null, channel: null, look: NO_LOOK });
  });

  it("링크 페이지: 감사 문장에 팬덤 이름, 닉네임 아래 채널 아이콘(새 탭·풀이) — 인증 코드는 응답·화면 어디에도 없다", async () => {
    const issued = await verifyVia("haru", `https://www.youtube.com/@${YT_KEY}`);
    await saveProfile(A.login, "꿀벌단");
    const page = await loadCreatorLinkPage({ client: anonClient(), viewer: null, creatorId: A.creatorId, photoBase: "http://photo.test" });
    expect(page).not.toBeNull();
    const html = renderToStaticMarkup(createElement(CreatorProfilePage, page!.props));
    expect(html).toContain("꿀벌단 여러분의 마음 늘 감사해요");
    expect(html).toContain(`href="https://www.youtube.com/@${YT_KEY}" target="_blank" rel="noopener noreferrer"`);
    expect(html).toMatch(new RegExp(`title="@${YT_KEY} · \\d{4}\\.\\d{2}\\.\\d{2} 확인"`));
    for (const text of [html, JSON.stringify(page)]) expect(text.includes(issued.code)).toBe(false);
  });
});
