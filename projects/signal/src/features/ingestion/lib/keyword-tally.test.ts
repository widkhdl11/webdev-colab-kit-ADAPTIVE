import { describe, expect, it } from "vitest";
import { KNOWN_LIMIT, anchorList, ranked, tally, type Tally } from "./keyword-tally";

const counted = (...batches: string[][]): Tally => {
  const t: Tally = new Map();
  for (const names of batches) tally(t, names);
  return t;
};

describe("tally — INV-B3 같은 뜻은 한 행으로 합친다", () => {
  it("대소문자만 다른 것을 합치고 **처음 나온 표기**를 쓴다", () => {
    // display 가 흔들리면 앵커 목록이 흔들리고, 앵커가 흔들리면 그다음 청크의 표기가
    // 전부 흔들린다 — 표기를 맞추려고 만든 장치가 표기를 흩는다.
    const t = counted(["MCP"], ["mcp"], ["Mcp"]);
    expect(t.size).toBe(1);
    expect(ranked(t)).toEqual([{ display: "MCP", n: 3 }]);
  });

  it("하이픈·언더스코어·연속공백·조합형을 합친다 — normalizeTagName 과 같은 판정", () => {
    // 저장 유일성 키와 다른 기준으로 세면 화면의 뱃지 건수가 실제와 갈린다.
    expect(ranked(counted(["온-디바이스", "온_디바이스", "온 디바이스"]))).toEqual([
      { display: "온-디바이스", n: 3 },
    ]);
    expect(ranked(counted(["AI 모델", "AI  모델"]))).toEqual([{ display: "AI 모델", n: 2 }]);

    const 완성형 = "에이전트";
    const 조합형 = 완성형.normalize("NFD");
    expect(조합형).not.toBe(완성형); // 전제 확인
    expect(ranked(counted([완성형, 조합형]))).toEqual([{ display: 완성형, n: 2 }]);
  });

  it("서로 다른 말은 합치지 않는다", () => {
    // 합치는 쪽만 보면 전부 한 행으로 만드는 구현도 통과한다.
    expect(counted(["프론트엔드", "백엔드", "보안"]).size).toBe(3);
  });

  it("정규화하면 빈 값이 되는 것은 세지 않는다", () => {
    expect(counted(["   ", " - _ ", "보안"]).size).toBe(1);
  });
});

describe("ranked — 순서가 결정론이다", () => {
  it("건수 내림차순, 동률이면 표기순", () => {
    // 동률에서 순서를 안 정하면 같은 데이터로 두 번 돌릴 때 앵커 목록이 달라진다.
    const t = counted(["보안", "보안", "코딩", "가나", "다라"]);
    expect(ranked(t).map((v) => v.display)).toEqual(["보안", "가나", "다라", "코딩"]);
  });
});

describe("anchorList — INV-K6 상한", () => {
  it(`상한값 자체를 못 박는다 — ${KNOWN_LIMIT}개`, () => {
    // 상수에서 파생한 값으로만 확인하면 10 으로 바꿔도 통과한다.
    expect(KNOWN_LIMIT).toBe(80);
  });

  it("상한을 넘으면 자르되 **자주 나온 것부터** 남긴다", () => {
    const t: Tally = new Map();
    // 흔한 것을 **맨 뒤에** 넣는다. 앞에 넣으면 삽입 순서가 우연히 정답과 같아져서,
    // 정렬을 통째로 지워도 통과한다(2026-08-16 변이 확인에서 실제로 green 이었다).
    for (let i = 0; i < 100; i += 1) tally(t, [`말${i}`]);
    tally(t, ["흔함", "흔함"]);

    const list = anchorList(t);
    expect(list).toHaveLength(KNOWN_LIMIT);
    // 정렬이 없으면 이 자리는 `말0` 이고 `흔함` 은 상한 밖으로 밀려 아예 사라진다.
    expect(list[0]).toBe("흔함");
    // 100개 중 21개는 실제로 잘렸다 — 자르기가 도는 것을 확인한다.
    expect(t.size).toBe(101);
  });

  it("상한 아래면 그대로 다 준다", () => {
    expect(anchorList(counted(["가", "나"]))).toEqual(["가", "나"]);
  });

  it("빈 집계는 빈 목록이다 — 부르는 쪽이 '목록 없음'을 판단할 수 있어야 한다", () => {
    // 빈 목록을 프롬프트에 실으면 모델이 그걸 제약으로 읽는다(INV-B3 실패경로).
    expect(anchorList(new Map())).toEqual([]);
  });
});
