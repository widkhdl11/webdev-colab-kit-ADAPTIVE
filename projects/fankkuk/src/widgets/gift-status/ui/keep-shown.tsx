"use client";

import { useState, type ReactNode } from "react";

// 처음 그릴 때 보이기로 한 칸은 그 화면에 머무는 동안 계속 보인다.
// 「받는 주소 없이 보냈어요」 구간(action-center INV-J13): 찾기에 성공하면 화면을 다시 읽어 고를 상자가 줄어든다 —
// 그때 구간이 사라지면 찾기 결과 안내도 함께 사라지므로, 첫 그림에서 정한 것만 따르고 다시 읽어도 바꾸지 않는다.
export function KeepShown({ show, children }: { show: boolean; children: ReactNode }) {
  const [shown] = useState(show);
  return shown ? <>{children}</> : null;
}
