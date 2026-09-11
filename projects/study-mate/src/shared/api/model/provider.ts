/**
 * 텍스트 모델을 부르는 자리의 모양.
 *
 * 프롬프트를 두 조각으로 나눠 받는다: `instruction` 은 우리가 쓴 지시문이고 `data` 는
 * 사람들이 쓴 글자를 담은 JSON 한 덩어리다. 구현이 둘을 어떻게 실어 보내는지는 제공자마다
 * 다를 수 있어서(시스템 지시문 자리가 따로 있는 곳도 있다) 여기서는 안 합친다.
 *
 * 타입이 따로 있는 이유는 바꿔 끼우기 위해서다 — 검사는 대역을 넣고, 앱은 제공자 구현을
 * 넣는다. 대역이 있어야 「모델을 부르나 안 부르나」를 셀 수 있다.
 */
export type GenerateRequest = {
  readonly instruction: string;
  readonly data: string;
  /**
   * 끊김 신호. 구현은 이걸 제공자에게 넘겨 붙잡고 있던 것을 놓게 한다.
   *
   * **상한 시간을 여기에 안 넣는다.** 넣으면 「제 시간에 끝난다」의 강제 위치가 구현 쪽이
   * 되고, 신호를 안 보는 구현 하나가 홈 전체를 멈춰 세운다 — 실제로 그렇게 짰다가
   * 검사에서 걸렸다. 상한은 부르는 쪽이 쥔다 (INV-G5).
   */
  readonly signal?: AbortSignal;
  /** JSON 만 받고 싶을 때. 제공자가 지원하면 쓰고 아니면 지시문에만 기댄다 */
  readonly expectJson?: boolean;
};

export type TextModel = {
  generate(request: GenerateRequest): Promise<string>;
};

/**
 * 지시문과 데이터를 나눈 프롬프트 한 벌.
 *
 * `instruction` 은 우리가 쓴 글이고 `data` 는 사람이 쓴 글자를 담은 JSON 한 덩어리다.
 * 구분자를 정해 두지 않는 이유는 남이 쓴 글이 그 구분자를 흉내 낼 수 있기 때문이다 —
 * JSON 은 문자열 안의 따옴표·중괄호·줄바꿈을 이스케이프하므로 경계를 글자로 못 흉내 낸다.
 *
 * 이 타입이 shared 에 있는 이유는 프롬프트를 만드는 기능이 둘(추천·초안)이고 둘 다
 * 같은 모양으로 모델을 부르기 때문이다. 도메인 지식은 안 담긴다 — 여기 있는 것은
 * 「모델에 무엇을 어떤 자리로 보내는가」뿐이다.
 */
export type Prompt = {
  readonly instruction: string;
  readonly data: string;
};
