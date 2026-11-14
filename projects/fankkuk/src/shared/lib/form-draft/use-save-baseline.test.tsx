// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { useSaveBaseline } from "./use-save-baseline";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("useSaveBaseline — 저장 버튼은 바꾼 값이 있을 때만", () => {
  it("처음은 바뀌지 않음 → 값을 바꾸면 바뀜 → 되돌리면 다시 바뀌지 않음 → 저장하면 그 값이 새 기준", async () => {
    let api: { set: (v: string) => void; dirty: boolean; markSaved: (s: string) => void } | null = null;
    function Probe() {
      const [v, set] = useState("a");
      const { dirty, markSaved } = useSaveBaseline(v);
      api = { set, dirty, markSaved };
      return null;
    }
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<Probe />));
    expect(api!.dirty).toBe(false);
    await act(async () => api!.set("b"));
    expect(api!.dirty).toBe(true);
    await act(async () => api!.set("a"));
    expect(api!.dirty).toBe(false);
    await act(async () => api!.set("c"));
    await act(async () => api!.markSaved("c"));
    expect(api!.dirty).toBe(false);
    await act(async () => root.unmount());
  });
});
