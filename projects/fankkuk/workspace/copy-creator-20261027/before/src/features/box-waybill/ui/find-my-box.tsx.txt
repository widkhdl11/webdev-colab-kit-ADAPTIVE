"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { CARRIER_LABEL, CARRIERS, isCarrier, type Carrier } from "@/entities/parcel/model/carrier";
import { parseWaybillInput } from "@/entities/parcel/model/waybill-no";
import { postFind } from "../api/post-waybill-client";
import type { FinderBox } from "../model/box-targets";
import s from "./box-waybill.module.css";

// 받는 주소 없이 보냈어요 (inbound-address-code INV-C4 ②·C10, 시안 gift-boxes.html 의 「내 물건 찾기」 자리).
// 받는 주소(6자리) 없이 보낸 상자는 사무실에서 보류로 들어간다. 주인이 아직 입고되지 않은 내 상자 하나를 고르고,
// 그 상자를 보낸 송장번호·택배사를 넣어 둘 다 맞으면 이어진다. 팬 상자는 송장 「보내는 분」이 내 닉네임과 맞았던 상자만 —
// 닉네임은 다시 넣지 않는다(로그인한 계정의 것, INV-C4 ②-가, 카드 d94). 역조공 몫은 두 값뿐(②-나).
// 이어도 되는지는 DB 찾기 함수가 본인 토큰으로 판정한다. 못 찾으면 이유(남의 상자·아직 안 옴·기한 지남)를 나누지 않는다.
// 보류 상자 목록은 어디에도 보여 주지 않는다(INV-C10). 하루 5번을 넘으면 서버가 429 와 문구를 준다 — 오류 줄에 그대로 보인다.

export type { FinderBox } from "../model/box-targets";

type Result = { kind: "ok"; label: string } | { kind: "no"; message: string };

/**
 * boxes = 아직 입고되지 않은 내 상자들 — 「어느 상자인가요」에서 고른다(선물 상세).
 * box = 상자가 이미 정해진 자리(처리할 일 카드 — 카드 하나가 상자 하나) — 고르는 칸과 위 안내 문단 없이 그 상자로 보낸다.
 */
type Props = { boxes: readonly FinderBox[]; box?: never } | { box: FinderBox; boxes?: never };

export function FindMyBox(props: Props) {
  const fixed = props.box ?? null;
  const boxes: readonly FinderBox[] = fixed ? [fixed] : (props.boxes ?? []);
  const id = useId();
  const router = useRouter();
  const [picked, setPicked] = useState<string | null>(null);
  const [carrier, setCarrier] = useState<Carrier | "">("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 화면이 틀렸다고 본 칸 — 그 칸에 오류를 잇고 초점을 옮긴다. 서버가 거부한 것은 어느 칸인지 몰라 비워 둔다
  const [errorField, setErrorField] = useState<"waybill" | "carrier" | null>(null);
  const waybillInput = useRef<HTMLInputElement>(null);
  const carrierSelect = useRef<HTMLSelectElement>(null);
  const [busy, setBusy] = useState(false);
  // 찾기 결과가 나오면 결과 칸으로 포커스를 옮긴다 — 마지막 상자를 찾으면 양식이 사라져 포커스가 갈 곳이 없어지기 때문이다
  const moved = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moved.current || !result) return;
    moved.current = false;
    resultRef.current?.focus();
  }, [result]);
  // 찾은 상자는 다시 읽으면 목록에서 빠진다 — 고른 상자가 없어졌으면 첫 상자로
  const current = boxes.find((b) => b.target.id === picked) ?? boxes[0] ?? null;

  async function submit(form: HTMLFormElement) {
    if (busy || !current) return;
    const data = new FormData(form);
    const waybill = data.get("waybill");
    const parsed = parseWaybillInput(typeof waybill === "string" ? waybill : "");
    if (!parsed.ok) {
      setError(parsed.message);
      setErrorField("waybill");
      setResult(null);
      waybillInput.current?.focus();
      return;
    }
    if (!carrier) {
      setError("택배사를 선택해 주세요.");
      setErrorField("carrier");
      setResult(null);
      carrierSelect.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    setErrorField(null);
    setResult(null);
    const outcome = await postFind(current.target, parsed.value, carrier);
    setBusy(false);
    if (outcome.kind === "ok") {
      moved.current = true;
      if (outcome.body.matched === true) {
        setResult({ kind: "ok", label: current.label });
        form.reset();
        setCarrier("");
        router.refresh();
        return;
      }
      // 못 찾은 것은 실패가 아니라 찾기의 결과다
      setResult({ kind: "no", message: typeof outcome.body.message === "string" ? outcome.body.message : "일치하는 상자가 없습니다." });
      return;
    }
    setError(outcome.message);
    // 409 = 그 사이 입고됐다 — 목록을 다시 읽는다
    if (outcome.status === 409) router.refresh();
  }

  return (
    <div className={s.finder}>
      {/* 바로 위에 「받는 주소 없이 보냈어요」 제목이 있다 — 같은 뜻의 제목을 한 단계 더 두지 않고 안내 문단으로 둔다. 상자가 정해진 카드에는 없다 */}
      {fixed ? null : <p className={s["finder-q"]}>주소 끝 6자리 없이 보낸 상자 찾기</p>}
      {current ? (
        <form
          aria-label="주소 끝 6자리 없이 보낸 상자 찾기"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit(e.currentTarget);
          }}
        >
          {fixed ? null : (
            <div className="field">
              <label htmlFor={`${id}-box`}>상자 선택</label>
              <select
                id={`${id}-box`}
                className="input"
                value={current.target.id}
                onChange={(e) => setPicked(e.currentTarget.value)}
                aria-describedby={`${id}-box-hint`}
              >
                {boxes.map((b) => (
                  <option key={b.target.id} value={b.target.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <p className="hint" id={`${id}-box-hint`}>
                입고 전인 내 상자만 표시
              </p>
            </div>
          )}
          <div className="field">
            <label htmlFor={`${id}-carrier`}>택배사</label>
            <select
              ref={carrierSelect}
              id={`${id}-carrier`}
              className="input"
              value={carrier}
              onChange={(e) => setCarrier(isCarrier(e.currentTarget.value) ? e.currentTarget.value : "")}
              aria-invalid={errorField === "carrier" ? true : undefined}
              aria-describedby={errorField === "carrier" ? `${id}-error` : undefined}
            >
              <option value="">택배사 선택</option>
              {CARRIERS.map((c) => (
                <option key={c} value={c}>
                  {CARRIER_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-no`}>송장번호</label>
            <input
              id={`${id}-no`}
              name="waybill"
              className="input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="숫자만 입력"
              ref={waybillInput}
              aria-invalid={errorField === "waybill" ? true : undefined}
              aria-describedby={errorField === "waybill" ? `${id}-error` : undefined}
            />
          </div>
          {error ? (
            <p className={s.error} id={`${id}-error`} role="alert">
              <span className={s["error-mark"]} aria-hidden="true">
                !
              </span>
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn" aria-disabled={busy}>
            {busy ? "조회 중…" : "찾기"}
          </button>
        </form>
      ) : (
        <p className={s["finder-none"]}>입고 전인 상자가 없습니다.</p>
      )}
      <div role="status">
        {result?.kind === "ok" ? (
          <div ref={resultRef} tabIndex={-1} className={`${s.result} ${s["result--ok"]}`}>
            <strong>도착 확인</strong>
            <p>{result.label} · 검수 예정</p>
          </div>
        ) : null}
        {result?.kind === "no" ? (
          <div ref={resultRef} tabIndex={-1} className={s.result}>
            <strong>아직 못 찾았어요</strong>
            <p>{result.message}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
