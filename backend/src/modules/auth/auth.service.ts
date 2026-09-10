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
