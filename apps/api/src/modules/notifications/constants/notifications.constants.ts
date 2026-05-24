export const NOTIFICATIONS_QUEUE = 'notifications'

/** Deliver a single already-persisted notification record */
export const SEND_NOTIFICATION_JOB = 'send-notification'

/** Fan-out all channels for a pending invite — processor creates records + sends */
export const SEND_INVITE_NOTIFICATIONS_JOB = 'send-invite-notifications'

export const NOTIFICATION_MAX_ATTEMPTS = 3

export interface SendNotificationJobData {
  notificationId: string
}

export interface SendInviteNotificationsJobData {
  inviteId: string
  businessName: string
  inviterName?: string
}

export type NotificationJobData = SendNotificationJobData | SendInviteNotificationsJobData
