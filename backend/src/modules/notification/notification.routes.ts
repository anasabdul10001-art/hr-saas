import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import * as notificationService from "./notification.service";

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
    res.status(404).json({ error: (err as Error).message });
  }
});

notificationRouter.post("/read-all", async (req, res) => {
  await notificationService.markAllRead(req.user!.id);
  res.status(204).send();
});
