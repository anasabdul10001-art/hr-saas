import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/jwt";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";

export type AuthenticatedUser = {
  id: string;
  companyId: string | null;
  role: UserRole;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  try {
    const payload = verifyAccessToken(header.slice("Bearer ".length));
    req.user = { id: payload.sub, companyId: payload.companyId, role: payload.role as UserRole };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

// Every tenant-scoped route must run through this: it guarantees req.user.companyId
// is set, so handlers can filter every Prisma query by it and never leak cross-tenant data.
export function requireCompanyContext(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.companyId) {
    return res.status(403).json({ error: "This action requires a company context" });
  }
  next();
}

// Gives a Super Admin-suspended company's Admin/HR just enough access to see why and fix
// billing, while blocking the rest of the HR product. Mount after requireCompanyContext on
// every tenant router except the billing routes themselves.
export async function blockSuspendedCompany(req: Request, res: Response, next: NextFunction) {
  const company = await prisma.company.findUnique({ where: { id: req.user!.companyId! }, select: { isSuspended: true } });
  if (company?.isSuspended) {
    return res.status(402).json({ error: "This company's account is suspended. Contact billing to reactivate." });
  }
  next();
}
