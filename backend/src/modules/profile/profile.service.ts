import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma";

const PROFILE_SELECT = { id: true, email: true, name: true, avatarUrl: true, role: true, companyId: true } as const;

export async function getProfile(userId: string) {
  return prisma.user.findUniqueOrThrow({ where: { id: userId }, select: PROFILE_SELECT });
}

export async function updateProfile(userId: string, input: { name?: string; email?: string }) {
  if (input.email) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing && existing.id !== userId) throw new Error("Email already in use");
  }
  return prisma.user.update({ where: { id: userId }, data: input, select: PROFILE_SELECT });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new Error("Current password is incorrect");

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    // Same "sign out everywhere" behavior as a token-based reset — an in-app password change
    // should end every other session too.
    prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}

export async function updateAvatar(userId: string, avatarUrl: string) {
  return prisma.user.update({ where: { id: userId }, data: { avatarUrl }, select: PROFILE_SELECT });
}
