import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import { requireAuth } from "../../middleware/auth";
import * as profileService from "./profile.service";
import { isCloudinaryConfigured, uploadImage } from "../../lib/cloudinary";

export const profileRouter = Router();

profileRouter.use(requireAuth);

profileRouter.get("/", async (req, res) => {
  const user = await profileService.getProfile(req.user!.id);
  res.json(user);
});

const updateSchema = z.object({ name: z.string().min(1).max(100).optional(), email: z.string().email().optional() });

profileRouter.patch("/", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const user = await profileService.updateProfile(req.user!.id, parsed.data);
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

const passwordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) });

profileRouter.post("/password", async (req, res) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    await profileService.changePassword(req.user!.id, parsed.data.currentPassword, parsed.data.newPassword);
    res.json({ message: "Password updated" });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

const uploadsDir = path.join(__dirname, "../../../uploads/avatars");
fs.mkdirSync(uploadsDir, { recursive: true });

// Cloudinary configured -> upload there (survives redeploys, works on Render's free tier which
// has no persistent disk). Not configured -> local disk, same as before (fine for local dev).
const upload = multer({
  storage: isCloudinaryConfigured() ? multer.memoryStorage() : multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${req.user!.id}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Only image files are allowed"));
    cb(null, true);
  },
});

profileRouter.post("/avatar", (req, res) => {
  // Wrapped manually (rather than used as normal route middleware) so multer errors — wrong
  // file type, over the size limit — come back as a 400 with a clear message instead of falling
  // through to the app's generic 500 error handler.
  upload.single("avatar")(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err instanceof Error ? err.message : "Upload failed" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    try {
      const avatarUrl = isCloudinaryConfigured()
        ? await uploadImage(req.file.buffer, `avatars/${req.user!.id}`)
        : `/uploads/avatars/${req.file.filename}`;

      const user = await profileService.updateAvatar(req.user!.id, avatarUrl);
      res.json(user);
    } catch (uploadErr) {
      res.status(502).json({ error: uploadErr instanceof Error ? uploadErr.message : "Upload failed" });
    }
  });
});
