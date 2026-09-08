export { readUnreadNotificationCount } from "./api/read-unread-count";
export { readMyNotifications, NOTIFICATION_PAGE_SIZE } from "./api/read-my-notifications";
export {
  NOTIFICATION_TYPES,
  countUnread,
  isNotificationType,
  isUnread,
  markAllReadIn,
  markReadIn,
  notificationSentence,
  removeFrom,
  type MyNotification,
  type NotificationSentence,
  type NotificationType,
} from "./model/notification";
