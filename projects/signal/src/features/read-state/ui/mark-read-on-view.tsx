"use client";

import { useEffect } from "react";
import { useReadArticles } from "../model/use-read-articles";

/**
 * 이 화면이 실제로 열렸을 때 읽음으로 기록한다.
 *
 * 목록에서 클릭하는 순간이 아니라 **상세가 뜬 시점**에 기록하는 것이 핵심이다.
 * 클릭 시점에 찍으면 이동이 실패했을 때(라우트 없음·네트워크 끊김) 읽지도 않은 글이
 * 흐릿해진 채로 굳는다 — "이미 연 소식"이라는 정의와 어긋난다.
 */
export function MarkReadOnView({ id }: { id: string }) {
  const { markRead } = useReadArticles();

  useEffect(() => {
    markRead(id);
  }, [id, markRead]);

  return null;
}
