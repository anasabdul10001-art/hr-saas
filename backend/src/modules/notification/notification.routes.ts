import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import * as notificationService from "./notification.service";
import { respondError } from "../../lib/respondError";

export const notificationRouter = Router();

notificationRouter.use(requireAuth);

notificationRouter.get("/me", async (req, res) => {
  const [notifications, unreadCount] = await Promise.all([
    notificationService.listMyNotifications(req.user!.id),
    notificationService.countUnread(req.user!.id),
  ]);
  res.json({ notifications, unreadCount });
});

notificationRouter.post("/:id/read", async (req, res) => {
  try {
    const notification = await notificationService.markRead(req.user!.id, req.params.id);
    res.json(notification);
  } catch (err) {
    respondError(res, 404, err);
  }
});

notificationRouter.post("/read-all", async (req, res) => {
  await notificationService.markAllRead(req.user!.id);
  res.status(204).send();
});
