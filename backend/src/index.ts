import { app } from "./app";
import { env } from "./config/env";
import { startAccountingSyncWorker } from "./modules/accounting/accountingSync.service";

app.listen(env.port, () => {
  console.log(`Backend listening on http://localhost:${env.port}`);
  // sends payroll costs that are waiting (or failed earlier) to the linked bookkeeping
  startAccountingSyncWorker();
});
