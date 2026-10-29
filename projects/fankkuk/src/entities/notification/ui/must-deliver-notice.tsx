import { mustDeliverLabels, type NotificationAudience } from "../model/delivery-policy";

// 알림 설정 화면의 필수 알림 안내 (notifications INV-N6, my-account INV-A11, 2026-10-12 문제집 D7).
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
      <strong className={titleClassName}>필수 알림: {labels.join(" · ")}</strong><br />
      <span className={bodyClassName}>
        선물 진행·결제·상자 처리에 필요한 알림은 수신 설정과 관계없이 발송됩니다.
        {extra ? (
          <>
            <br />
            {extra}
          </>
        ) : null}
      </span>
    </p>
  );
}
