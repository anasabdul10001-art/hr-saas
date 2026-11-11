import { Router } from "express";
import { blockSuspendedCompany, requireAuth, requireCompanyContext } from "../../middleware/auth";
import * as dashboardService from "./dashboard.service";
import { respondError } from "../../lib/respondError";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth, requireCompanyContext, blockSuspendedCompany);

dashboardRouter.get("/", async (req, res) => {
  try {
    const data = await dashboardService.getDashboard(req.user!);
    res.json(data);
  } catch (err) {
    respondError(res, 400, err);
  }
});
