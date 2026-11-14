import { useState } from "react";

// 저장 버튼 — 마지막으로 저장한 값과 지금 값이 다른가. 다르지 않으면 「저장」은 회색이고 누를 수 없다(설정 화면 재디자인 2026-11-14).
// snapshot 은 부르는 쪽이 지금 값을 문자열 하나로 만든 것(JSON.stringify 등). 저장에 성공하면 실제로 저장된 값의 snapshot 으로 markSaved 를 부른다.
export function useSaveBaseline(snapshot: string): { dirty: boolean; markSaved: (saved: string) => void } {
  const [baseline, setBaseline] = useState(snapshot);
  return { dirty: snapshot !== baseline, markSaved: setBaseline };
}
