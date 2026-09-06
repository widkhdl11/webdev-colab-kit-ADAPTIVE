// 슬라이스 밖으로 나가는 시그니처. 조회 함수들은 검사를 위해 판독기를 **기본 인자로**
// 열어 두는데, 그 인자가 배럴로 그대로 나가면 부르는 쪽이 어떤 클라이언트로 읽을지
// 고를 수 있게 된다. 「인가는 접근 정책이 한다」가 성립하는 근거가 **세션에 묶인
// 클라이언트**라서, 그 자리를 열어 두면 근거가 한 칸 약해진다.
//
// 검사는 같은 슬라이스 안에서 원본을 직접 import 한다 — 여기를 거치지 않는다.

import { readMyParticipations as readMyParticipationsImpl } from "./read-my-participations";
import type { MyParticipation } from "./read-my-participations";
import {
  readMyStudies as readMyStudiesImpl,
  readPostableStudies as readPostableStudiesImpl,
  type PostableStudy,
} from "./read-my-studies";
import type { MyStudy } from "../model/my-study";

export function readPostableStudies(userId: string): Promise<readonly PostableStudy[]> {
  return readPostableStudiesImpl(userId);
}

export function readMyStudies(userId: string): Promise<readonly MyStudy[]> {
  return readMyStudiesImpl(userId);
}

export function readMyParticipations(userId: string): Promise<readonly MyParticipation[]> {
  return readMyParticipationsImpl(userId);
}
