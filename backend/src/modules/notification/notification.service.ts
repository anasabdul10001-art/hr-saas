import { UserRole } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export async function notify(userId: string, type: string, title: string, body?: string) {
  return prisma.notification.create({ data: { userId, type, title, body } });
}

export async function notifyMany(userIds: string[], type: string, title: string, body?: string) {
  if (userIds.length === 0) return;
  await prisma.notification.createMany({ data: userIds.map((userId) => ({ userId, type, title, body })) });
}

// Resolves who should be notified about a leave/advance request at its current approval stage:
// the assigned manager's linked user at the manager stage, or every HR/Company Admin in the
// company at the HR stage. Silently notifies nobody if a manager has no self-service login.
export async function resolveApproverUserIds(
  companyId: string,
  stage: "PENDING_MANAGER" | "PENDING_HR",
  managerEmployeeId: string | null
): Promise<string[]> {
  if (stage === "PENDING_MANAGER") {
    if (!managerEmployeeId) return [];
    const manager = await prisma.employee.findUnique({ where: { id: managerEmployeeId }, select: { userId: true } });
    return manager?.userId ? [manager.userId] : [];
  }

  const hrAndAdmins = await prisma.user.findMany({
    where: { companyId, role: { in: [UserRole.HR, UserRole.COMPANY_ADMIN] } },
    select: { id: true },
  });
  return hrAndAdmins.map((u) => u.id);
}

export async function listMyNotifications(userId: string) {
  return prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 });
}

export async function countUnread(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markRead(userId: string, notificationId: string) {
  const notification = await prisma.notification.findFirst({ where: { id: notificationId, userId } });
  if (!notification) throw new Error("Notification not found");
  return prisma.notification.update({ where: { id: notificationId }, data: { readAt: new Date() } });
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}
