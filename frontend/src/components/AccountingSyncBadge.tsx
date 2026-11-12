import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import type { AccountingSyncJob, PayrollRunStatus } from "../lib/types";

/**
 * Next to a payroll run: has its cost reached the owner's accounting? Shown only for a linked company, and
 * only where there is something to say (a paid run, or one whose payment was taken back after being sent).
 */
export function AccountingSyncBadge({ runId, runStatus, job, canRetry }: { runId: string; runStatus: PayrollRunStatus; job?: AccountingSyncJob; canRetry: boolean }) {
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: async () => (await api.post(`/accounting-link/runs/${runId}/retry`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accountingSync"] }),
  });
  if (!job) return null;
  // a run that is paid again, or no longer paid, only matters while its latest wish is the current state
  const withdrawing = job.desiredState === "REVERTED";
  if (withdrawing && runStatus === "PAID") return null;

  if (job.status === "SYNCED") {
    return (
      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
        {withdrawing ? "Withdrawn from accounting" : "In accounting"}
      </span>
    );
  }
  if (job.status === "PENDING") {
    return (
      <span
        className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700"
        title={job.lastError ? `${job.lastError}. It will be tried again by itself.` : undefined}
      >
        {job.attempts > 0 ? `${withdrawing ? "Withdrawing" : "Sending"} — retrying (${job.attempts})` : withdrawing ? "Withdrawing…" : "Sending…"}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700" title={job.lastError ?? undefined}>
        {withdrawing ? "Not withdrawn" : "Not sent to accounting"}
      </span>
      {canRetry && (
        <button
          onClick={() => retry.mutate()}
          disabled={retry.isPending}
          className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
        >
          <RefreshCw size={13} />
          Retry
        </button>
      )}
    </span>
  );
}
