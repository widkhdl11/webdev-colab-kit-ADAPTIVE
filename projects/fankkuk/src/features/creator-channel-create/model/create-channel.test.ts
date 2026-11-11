import { describe, expect, it } from "vitest";
import type { Viewer } from "@/entities/session/model/viewer";
import { NICKNAME_TAKEN } from "@/entities/session/model/nickname-rule";
import { CHANNEL_REQUIRED_MESSAGE } from "@/entities/creator/model/channel-profile";
import { channelCreateInputSchema, channelFieldOf } from "./channel-create-input";
import { channelCreateRejection, createMyChannel, type CreateChannelDeps } from "./create-channel";

// 채널 만들기 (signup INV-U21 · INV-U13 · creator-tags INV-T3). 입력 검사 → create_my_channel 한 번 → 오류 코드를 칸별 문구로.

const TAG1 = "11111111-1111-4111-8111-000000000001";
const TAG2 = "11111111-1111-4111-8111-000000000002";
const CREATOR: Viewer = { userId: "u1", role: "creator", loginId: "honeypot" };
const FAN: Viewer = { userId: "u2", role: "fan", nickname: "팬", loginId: "fan01" };

type Call = { fn: string; args: Record<string, unknown> };
function client(error: { code: string } | null = null) {
  const calls: Call[] = [];
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    return { data: null, error };
  };
  return { calls, rpc: rpc as unknown as CreateChannelDeps["client"]["rpc"] };
}

const body = (extra: Record<string, unknown> = {}) => ({ nickname: " 꿀단지 ", fanName: " 꿀벌단 ", tagIds: [TAG1, TAG2], customTag: "", ...extra });

describe("INV-U21: 채널 만들기 입력 검사", () => {
  it("INV-U21 INV-U13: 닉네임·팬덤 이름은 앞뒤 공백을 떼고, 태그는 그대로 — 맞는 입력은 통과", () => {
    expect(channelCreateInputSchema.parse(body())).toEqual({ nickname: "꿀단지", fanName: "꿀벌단", tagIds: [TAG1, TAG2], customTag: "" });
    // 팬덤 이름은 선택
    expect(channelCreateInputSchema.safeParse(body({ fanName: undefined })).success).toBe(true);
  });

  it("INV-U21 INV-U13 (실패경로): 닉네임이 없거나 13자·공백뿐·보이지 않는 글자면 닉네임 칸", () => {
    for (const nickname of [undefined, "", "가".repeat(13), "   ", "하​루"]) {
      const r = channelCreateInputSchema.safeParse(body({ nickname }));
      expect([nickname, r.success, channelFieldOf(r.error?.issues[0]?.path ?? [])]).toEqual([nickname, false, "nickname"]);
    }
  });

  it("INV-U21 INV-T3 (실패경로): 태그 0개·6개·같은 선택지 두 번·직접 입력 21자는 태그 칸", () => {
    const six = ["1", "2", "3", "4", "5", "6"].map((n) => `11111111-1111-4111-8111-00000000000${n}`);
    for (const bad of [
      { tagIds: [], customTag: "" },
      { tagIds: [], customTag: "  " },
      { tagIds: six, customTag: "" },
      { tagIds: [TAG1, TAG1], customTag: "" },
      { tagIds: [TAG2], customTag: "가".repeat(21) },
    ]) {
      const r = channelCreateInputSchema.safeParse(body(bad));
      expect([bad, channelFieldOf(r.error?.issues[0]?.path ?? [])]).toEqual([bad, "tags"]);
    }
  });

  it("INV-U21 (실패경로): 팬덤 이름 11자·보이지 않는 글자는 팬덤 이름 칸 — 10자는 받는다", () => {
    expect(channelCreateInputSchema.safeParse(body({ fanName: "가".repeat(10) })).success).toBe(true);
    for (const fanName of ["가".repeat(11), "꿀​벌"]) {
      const r = channelCreateInputSchema.safeParse(body({ fanName }));
      expect([fanName, channelFieldOf(r.error?.issues[0]?.path ?? [])]).toEqual([fanName, "fanName"]);
    }
  });
});

describe("INV-U21: 채널 만들기 서버 처리", () => {
  it("INV-U21 (S21c): 크리에이터면 create_my_channel 을 한 번, 정해진 네 칸만 넘긴다(직접 입력이 없으면 null, 팬덤 이름이 비면 null)", async () => {
    const c = client();
    expect(await createMyChannel({ client: c, viewer: CREATOR }, body({ accountId: "someone-else" }))).toEqual({ ok: true });
    expect(c.calls).toEqual([{ fn: "create_my_channel", args: { p_nickname: "꿀단지", p_fan_name: "꿀벌단", p_tag_ids: [TAG1, TAG2], p_custom_tag: null } }]);
    const blank = client();
    await createMyChannel({ client: blank, viewer: CREATOR }, body({ fanName: "  ", customTag: " 먹방 " }));
    expect(blank.calls[0]?.args).toMatchObject({ p_fan_name: null, p_custom_tag: "먹방" });
  });

  it("INV-U21 (S21f, 실패경로): 로그인 안 함 401 · 팬 403 — DB 를 부르지 않는다", async () => {
    const none = client();
    expect(await createMyChannel({ client: none, viewer: null }, body())).toMatchObject({ ok: false, status: 401 });
    const fan = client();
    expect(await createMyChannel({ client: fan, viewer: FAN }, body())).toMatchObject({ ok: false, status: 403 });
    expect([...none.calls, ...fan.calls]).toEqual([]);
  });

  it("INV-U21 (실패경로): 입력이 틀리면 그 칸으로 400 — DB 를 부르지 않는다", async () => {
    const c = client();
    expect(await createMyChannel({ client: c, viewer: CREATOR }, body({ nickname: "" }))).toMatchObject({ ok: false, status: 400, field: "nickname" });
    expect(await createMyChannel({ client: c, viewer: CREATOR }, body({ tagIds: [] }))).toMatchObject({ ok: false, status: 400, field: "tags" });
    expect(c.calls).toEqual([]);
  });

  it("INV-U21 (S21d·S21e, 실패경로): DB 오류 코드를 칸별 문구로 — 닉네임 겹침 409·필터, 팬덤 이름 필터, 태그 필터, 이미 만듦 409", async () => {
    const cases: [string, { status: number; field: string; message?: string }][] = [
      ["FKU04", { status: 409, field: "nickname", message: NICKNAME_TAKEN }],
      ["FKU05", { status: 400, field: "nickname" }],
      ["FKU06", { status: 400, field: "nickname" }],
      ["FKU07", { status: 400, field: "nickname" }],
      ["P0084", { status: 400, field: "fanName", message: "팬덤 이름에 사용할 수 없는 표현이 포함되어 있습니다." }],
      ["P0085", { status: 400, field: "fanName" }],
      ["P0086", { status: 400, field: "fanName" }],
      ["P0082", { status: 400, field: "tags", message: "태그에 전화번호·이메일·인터넷 주소를 입력할 수 없습니다." }],
      ["22023", { status: 400, field: "tags" }],
      ["FKN02", { status: 409, field: "form", message: "이미 채널을 만들었습니다." }],
      ["42501", { status: 403, field: "form" }],
    ];
    for (const [code, want] of cases) {
      const r = await createMyChannel({ client: client({ code }), viewer: CREATOR }, body());
      expect([code, r]).toMatchObject([code, { ok: false, ...want }]);
      expect(channelCreateRejection(code)).toMatchObject(want);
    }
  });

  it("INV-U21 (실패경로): 꼴 거부 22023 은 DB 문장의 첫 말로 칸을 가른다 — 닉네임·팬덤 이름·그 밖(태그)", () => {
    expect(channelCreateRejection("22023", "닉네임은 1~12자, 보이지 않는 글자 없이")).toMatchObject({ field: "nickname" });
    expect(channelCreateRejection("22023", "팬을 부르는 이름은 0~10자다")).toMatchObject({ field: "fanName" });
    expect(channelCreateRejection("22023", "태그는 합쳐 1~5개다")).toMatchObject({ field: "tags" });
  });

  it("INV-U21 (실패경로): 모르는 오류는 성공으로 치지 않고 던진다", async () => {
    await expect(createMyChannel({ client: client({ code: "XX000" }), viewer: CREATOR }, body())).rejects.toThrow();
    expect(channelCreateRejection("XX000")).toBeNull();
  });

  it("INV-U21: 채널을 먼저 만들라는 문구는 한 곳에 있다", () => {
    expect(CHANNEL_REQUIRED_MESSAGE).toBe("채널을 먼저 만들어 주세요.");
  });
});
