/** Task F7c: an in-app notification (FR 8.x). */
import type { NotificationType } from '@campus-hop/shared';

export interface NotificationRecord {
  id: string;
  userId: string;
  type: NotificationType;
  message: string;
  link: string | null;
  isRead: boolean;
  timestamp: Date;
}

export class Notification {
  private constructor(private rec: NotificationRecord) {}

  static fromRecord(rec: NotificationRecord): Notification {
    return new Notification({ ...rec });
  }

  toRecord(): NotificationRecord {
    return { ...this.rec };
  }

  get isRead(): boolean {
    return this.rec.isRead;
  }

  markRead(): void {
    this.rec.isRead = true;
  }
}
