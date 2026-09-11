import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma";
import { generateRefreshToken, hashRefreshToken, signAccessToken } from "../../lib/jwt";
import { env } from "../../config/env";
import { SubscriptionStatus, UserRole } from "@prisma/client";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base) || "company";
  let suffix = 0;
  while (await prisma.company.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${slugify(base)}-${suffix}`;
  }
  return slug;
}

function refreshExpiryDate(): Date {
  const days = parseInt(env.jwtRefreshExpiresIn.replace("d", ""), 10) || 30;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function issueTokenPair(user: { id: string; companyId: string | null; role: UserRole }) {
  const accessToken = signAccessToken({ sub: user.id, companyId: user.companyId, role: user.role });
  const { token: refreshToken, tokenHash } = generateRefreshToken();

  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash, expiresAt: refreshExpiryDate() },
  });

  return { accessToken, refreshToken };
}

// Creates a new tenant (Company) plus its first Company Admin user.
export async function signupCompany(input: {
  companyName: string;
  currency: string;
  adminEmail: string;
  adminPassword: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.adminEmail } });
  if (existing) throw new Error("Email already in use");

  const slug = await uniqueSlug(input.companyName);
  const passwordHash = await bcrypt.hash(input.adminPassword, 12);

  const { company, user } = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: { name: input.companyName, slug, currency: input.currency },
    });
    const user = await tx.user.create({
      data: {
        companyId: company.id,
        email: input.adminEmail,
        passwordHash,
        role: UserRole.COMPANY_ADMIN,
      },
    });

    // Every company starts on a 14-day trial of the Free plan; upgrading is a billing action
    // handled separately (see modules/billing).
    const freePlan = await tx.subscriptionPlan.findFirst({ where: { name: "Free" } });
    if (freePlan) {
      await tx.subscription.create({
        data: {
          companyId: company.id,
          planId: freePlan.id,
          status: SubscriptionStatus.TRIALING,
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });
    }

    return { company, user };
  });

  const tokens = await issueTokenPair(user);
  return { company, user, ...tokens };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) throw new Error("Invalid credentials");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error("Invalid credentials");

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const tokens = await issueTokenPair(user);
  return { user, ...tokens };
}

export async function refresh(refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new Error("Invalid refresh token");
  }

  // Rotate: revoke the used token, issue a new pair.
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

  const tokens = await issueTokenPair(stored.user);
  return { user: stored.user, ...tokens };
}

export async function logout(refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// Always succeeds from the caller's point of view, whether or not the email exists — an
// anonymous, unauthenticated endpoint that revealed "no account with that email" would let
// anyone enumerate registered emails. The raw token is logged server-side rather than returned
// in the response (unlike the employee-invite temp password, which an already-authenticated
// HR/Admin requested for someone else): returning it here would let anyone reset any account's
// password just by knowing their email. Swap the console.log for a real email send when that's
// wired up.
export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return;

  const { token, tokenHash } = generateRefreshToken();
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });

  const resetUrl = `${env.frontendUrl}/reset-password?token=${token}`;
  console.log(`[DEV] Password reset requested for ${email}. Would be emailed in production. Link: ${resetUrl}`);
}

export async function resetPassword(token: string, newPassword: string) {
  const tokenHash = hashRefreshToken(token);
  const stored = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
    throw new Error("Invalid or expired reset link");
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction([
    prisma.user.update({ where: { id: stored.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
    // Resetting the password ends every existing session, same as a real "sign out everywhere".
    prisma.refreshToken.updateMany({ where: { userId: stored.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}
