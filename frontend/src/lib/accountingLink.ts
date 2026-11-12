import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { AccountingLinkInfo, AccountingSyncJob } from "./types";

/** The message the server gave for a failed request, else the fallback. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const error = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof error === "string" ? error : fallback;
}

/** The company's link to accounting and the delivery state of each payroll run (for the company admin and HR). */
export function useAccountingSync(enabled: boolean) {
  const link = useQuery({
    queryKey: ["accountingLink"],
    queryFn: async () => (await api.get<AccountingLinkInfo>("/accounting-link")).data,
    enabled,
  });
  const linked = link.data?.status === "ACTIVE";
  const jobs = useQuery({
    queryKey: ["accountingSync"],
    queryFn: async () => (await api.get<AccountingSyncJob[]>("/accounting-link/sync")).data,
    enabled: enabled && linked,
    // while something is waiting, look again soon, so "sending" turns into "sent" without a page reload
    refetchInterval: (q) => (q.state.data?.some((j) => j.status === "PENDING") ? 4000 : false),
  });
  const byRun = new Map((jobs.data ?? []).map((j) => [j.payrollRunId, j]));
  return { link: link.data, linked, jobs: byRun };
}
