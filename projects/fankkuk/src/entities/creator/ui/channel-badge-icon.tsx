import { channelBadgeTitle, channelPlatformLabel, type ChannelBadge } from "../model/channel-badge";
import { TagIconBadge } from "./creator-tag";
import { CheckIcon } from "./check-icon";
import s from "./channel-badge-icon.module.css";

// 확인된 채널 표시 둘 (추가분 4-3·4-5). 풀이 글자는 channelBadgeTitle 하나에서만 만든다 — 「@핸들 · YYYY.MM.DD 확인」.
// 마우스를 올리면 title 로, 화면 읽기에는 aria-label 로 같은 글자가 나온다.

/** 링크 페이지 닉네임 아래 — 플랫폼 아이콘 하나, 누르면 채널이 새 탭으로 열린다. */
export function ChannelLinkIcon({ channel, className }: { channel: ChannelBadge; className?: string }) {
  const label = channelPlatformLabel(channel);
  const title = channelBadgeTitle(channel);
  return (
    <a
      className={className ? `${s.link} ${className}` : s.link}
      href={channel.channelUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={`${label} 채널 새 탭에서 열기 (${title})`}
    >
      <TagIconBadge name={label} />
    </a>
  );
}

/** 함께한 시간 상단 프로필 옆 — 채널 소유 확인 표시(누르는 곳은 아니다). */
export function ChannelVerifiedMark({ channel, className }: { channel: ChannelBadge; className?: string }) {
  const title = channelBadgeTitle(channel);
  return (
    <span className={className ? `${s.mark} ${className}` : s.mark} role="img" title={title} aria-label={`${channelPlatformLabel(channel)} 채널 소유 확인 (${title})`}>
      <CheckIcon />
    </span>
  );
}
