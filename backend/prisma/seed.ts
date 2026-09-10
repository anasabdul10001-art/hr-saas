import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, SubscriptionStatus, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_PLANS = [
  { name: "Free", priceMonthly: 0, maxEmployees: 5, features: { attendance: true, leave: true, payroll: false } },
  { name: "Pro", priceMonthly: 4900, maxEmployees: 50, features: { attendance: true, leave: true, payroll: true, advances: true } },
  {
    name: "Enterprise",
    priceMonthly: 19900,
    maxEmployees: 1000,
    features: { attendance: true, leave: true, payroll: true, advances: true, prioritySupport: true },
  },
];

async function seedPlans() {
  for (const plan of DEFAULT_PLANS) {
    const existing = await prisma.subscriptionPlan.findFirst({ where: { name: plan.name } });
    if (existing) continue;
    await prisma.subscriptionPlan.create({ data: plan });
    console.log(`Created plan: ${plan.name}`);
  }
}

async function seedSuperAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL ?? "superadmin@local.test";
  const password = process.env.SUPER_ADMIN_PASSWORD ?? "changeme123";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Super Admin already exists: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({ data: { email, passwordHash, role: UserRole.SUPER_ADMIN, companyId: null } });

  if (!process.env.SUPER_ADMIN_EMAIL || !process.env.SUPER_ADMIN_PASSWORD) {
    console.log(
      `Created Super Admin with DEFAULT credentials (set SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD in .env before deploying anywhere real): ${email} / ${password}`
    );
  } else {
    console.log(`Created Super Admin: ${email}`);
  }
}

// Companies created before subscriptions existed (or ones that somehow ended up without one)
// get backfilled onto the Free plan so every company the Super Admin dashboard lists has one.
async function backfillSubscriptions() {
  const freePlan = await prisma.subscriptionPlan.findFirstOrThrow({ where: { name: "Free" } });
  const companiesWithoutSubscription = await prisma.company.findMany({ where: { subscription: null } });

  for (const company of companiesWithoutSubscription) {
    await prisma.subscription.create({
      data: {
        companyId: company.id,
        planId: freePlan.id,
        status: SubscriptionStatus.TRIALING,
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });
    console.log(`Backfilled subscription for company: ${company.name}`);
  }
}

async function main() {
  await seedPlans();
  await seedSuperAdmin();
  await backfillSubscriptions();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
