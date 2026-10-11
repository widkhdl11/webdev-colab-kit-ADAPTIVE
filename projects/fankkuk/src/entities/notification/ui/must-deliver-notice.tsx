import { mustDeliverLabels, type NotificationAudience } from "../model/delivery-policy";

// 알림 설정 화면의 「끌 수 없는 알림」 안내 (notifications INV-N6, my-account INV-A11, 2026-10-12 문제집 D7).
// 목록은 종류별 표(delivery-policy) 하나에서 만든다 — 화면마다 따로 적으면 표가 바뀔 때 화면이 옛 목록을 들고 있는다.
// 실제로 꺼도 보내는 판단은 DB 가 한다. 이 안내는 그것을 알려 줄 뿐이다.

type Props = {
  audience: NotificationAudience;
  id?: string;
  className?: string;
  titleClassName?: string;
  bodyClassName?: string;
  /** 화면마다 덧붙일 한 문장(예: 승인 요청을 놓치면 생기는 일) */
  extra?: string;
};

export function MustDeliverNotice({ audience, id, className, titleClassName, bodyClassName, extra }: Props) {
  const labels = mustDeliverLabels(audience);
  return (
    <p id={id} className={className}>
      <strong className={titleClassName}>끌 수 없는 알림</strong>{" "}
      <span className={bodyClassName}>
        {labels.join(", ")} — 선물을 진행하는 데 필요하거나 돈·상자가 걸린 일이라 꺼 두어도 가요.{extra ? ` ${extra}` : ""}
      </span>
    </p>
  );
}
