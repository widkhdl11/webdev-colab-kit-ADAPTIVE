// **이 파일이 서버 경계다.** `server-only` 를 들이면 클라이언트 컴포넌트가 여기 닿는
// 순간 빌드가 죽고, 편집 시점 검사도 그 경로를 따라와 잡는다 (INV-G1).
//
// 키를 실제로 쥐는 곳이 여기라서 표시가 여기 붙는다 — 이름 상수만 있는 `config.ts` 는
// 검사에서도 읽어야 하므로 경계를 안 친다.
import "server-only";

import { GoogleGenAI } from "@google/genai";
import { readModelConfig } from "./config";
import type { GenerateRequest, TextModel } from "./provider";

/** 답을 못 받았을 때. 부르는 쪽은 이걸 「모델을 못 썼다」로만 쓰고 화면에 안 보인다 */
export class ModelCallFailedError extends Error {
  constructor(cause?: unknown) {
    super("모델을 부르지 못했다");
    this.name = "ModelCallFailedError";
    this.cause = cause;
  }
}

let client: GoogleGenAI | null = null;

function genai(): { client: GoogleGenAI; model: string } {
  const config = readModelConfig();
  // 클라이언트를 매번 만들지 않는다 — 요청마다 새로 만들면 연결을 다시 세운다.
  client ??= new GoogleGenAI({ apiKey: config.apiKey });
  return { client, model: config.model };
}

export const geminiModel: TextModel = {
  async generate(request: GenerateRequest): Promise<string> {
    const { client: ai, model } = genai();

    // **상한 시간은 여기서 안 센다.** 부르는 쪽이 쥐고 신호로 내려보낸다 — 신호를 넘기는
    // 것은 SDK 가 붙잡고 있던 연결을 실제로 놓게 하기 위해서고, 「제 시간에 끝난다」의
    // 보장은 부르는 쪽에 있다.
    const response = await ai.models.generateContent({
      model,
      contents: request.data,
      config: {
        // 지시문은 데이터와 다른 자리에 넣는다. 한 문자열로 합치면 경계를 나눈 의미가 없다.
        systemInstruction: request.instruction,
        ...(request.signal === undefined ? {} : { abortSignal: request.signal }),
        // 순서를 고르는 일이라 창의성이 필요 없다. 낮게 두면 같은 입력에 같은 답에 가깝다.
        temperature: 0,
        ...(request.expectJson === true ? { responseMimeType: "application/json" } : {}),
      },
    });

    const text = response.text;
    if (text === undefined || text.trim() === "") throw new ModelCallFailedError("빈 응답");
    return text;
  },
};
