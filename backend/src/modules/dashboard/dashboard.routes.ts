import { Router } from "express";
import { blockSuspendedCompany, requireAuth, requireCompanyContext } from "../../middleware/auth";
import * as dashboardService from "./dashboard.service";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth, requireCompanyContext, blockSuspendedCompany);

dashboardRouter.get("/", async (req, res) => {
  try {
    const data = await dashboardService.getDashboard(req.user!);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
