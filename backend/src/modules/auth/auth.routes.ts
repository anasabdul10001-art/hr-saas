import { Router } from "express";
import { z } from "zod";
import * as authService from "./auth.service";

export const authRouter = Router();

const signupSchema = z.object({
  companyName: z.string().min(2),
  currency: z.string().length(3).default("usd"),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
});

authRouter.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const { company, user, accessToken, refreshToken } = await authService.signupCompany(parsed.data);
    res.status(201).json({
      company: { id: company.id, name: company.name, slug: company.slug },
      user: { id: user.id, email: user.email, role: user.role },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    res.status(409).json({ error: (err as Error).message });
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const { user, accessToken, refreshToken } = await authService.login(parsed.data.email, parsed.data.password);
    res.json({
      user: { id: user.id, email: user.email, role: user.role, companyId: user.companyId },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    res.status(401).json({ error: (err as Error).message });
  }
});

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

authRouter.post("/refresh", async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const { user, accessToken, refreshToken } = await authService.refresh(parsed.data.refreshToken);
    res.json({ user: { id: user.id, email: user.email, role: user.role, companyId: user.companyId }, accessToken, refreshToken });
  } catch (err) {
    res.status(401).json({ error: (err as Error).message });
  }
});

authRouter.post("/logout", async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  await authService.logout(parsed.data.refreshToken);
  res.status(204).send();
});

const forgotPasswordSchema = z.object({ email: z.string().email() });

authRouter.post("/forgot-password", async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  await authService.requestPasswordReset(parsed.data.email);
  // Same response whether or not the email exists — see the comment in auth.service.ts.
  res.json({ message: "If an account exists for that email, password reset instructions have been sent." });
});

const resetPasswordSchema = z.object({ token: z.string().min(1), newPassword: z.string().min(8) });

authRouter.post("/reset-password", async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    await authService.resetPassword(parsed.data.token, parsed.data.newPassword);
    res.json({ message: "Password updated. You can now log in." });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
