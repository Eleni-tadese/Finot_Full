// The bell in the top bar and the Notifications page each keep their own list.
// After one of them changes something (mark read, mark all read) it calls announce() so the other looks again.
export const NOTIFICATIONS_CHANGED = "finot:notifications-changed";

export const announceNotificationsChanged = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
