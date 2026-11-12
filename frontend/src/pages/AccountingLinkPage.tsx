import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Unlink } from "lucide-react";
import { api } from "../lib/api";
import { apiErrorMessage } from "../lib/accountingLink";
import { useAuth } from "../context/AuthContext";
import { AppShell } from "../components/AppShell";
import type { AccountingLinkInfo } from "../lib/types";

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

const statusBadge: Record<AccountingLinkInfo["status"], { text: string; style: string }> = {
  NONE: { text: "Not linked", style: "bg-slate-100 text-slate-600" },
  ACTIVE: { text: "Linked", style: "bg-emerald-50 text-emerald-700" },
  REVOKED: { text: "Cancelled in Dalilacom", style: "bg-amber-50 text-amber-700" },
};

export function AccountingLinkPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "COMPANY_ADMIN";
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const link = useQuery({
    queryKey: ["accountingLink"],
    queryFn: async () => (await api.get<AccountingLinkInfo>("/accounting-link")).data,
    enabled: isAdmin,
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["accountingLink"] });
    queryClient.invalidateQueries({ queryKey: ["accountingSync"] });
  };

  const connect = useMutation({
    mutationFn: async () => (await api.post("/accounting-link/connect", { code: code.trim() })).data,
    onSuccess: () => {
      setCode("");
      setMessage({ kind: "ok", text: "Linked. From now on, every payroll run you mark as paid is added to your accounting as one expense." });
      refresh();
    },
    onError: (err) => setMessage({ kind: "error", text: apiErrorMessage(err, "Could not link. Try again.") }),
  });

  const disconnect = useMutation({
    mutationFn: async () => (await api.delete<{ remoteNotified: boolean }>("/accounting-link")).data,
    onSuccess: (data) => {
      setMessage({
        kind: "ok",
        text: data.remoteNotified
          ? "The link was cancelled on both sides. Expenses already added stay in your accounting."
          : "The link was cancelled here, but Dalilacom could not be reached. Cancel it there too, from the accounting section.",
      });
      refresh();
    },
    onError: (err) => setMessage({ kind: "error", text: apiErrorMessage(err, "Could not cancel the link.") }),
  });

  const backfill = useMutation({
    mutationFn: async () => (await api.post<{ queued: number }>("/accounting-link/backfill")).data,
    onSuccess: (data) => {
      setMessage({ kind: "ok", text: data.queued === 0 ? "Nothing to send: every paid run is already there." : `${data.queued} earlier paid run(s) are being sent.` });
      refresh();
    },
    onError: (err) => setMessage({ kind: "error", text: apiErrorMessage(err, "Could not send the earlier runs.") }),
  });

  const info = link.data;
  const badge = statusBadge[info?.status ?? "NONE"];

  return (
    <AppShell title="Accounting link">
      {!isAdmin ? (
        <p className="card p-4 text-sm text-slate-600">Only the company admin can manage the accounting link.</p>
      ) : (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Link2 size={16} />
                Dalilacom accounting
              </h2>
              {info && <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge.style}`}>{badge.text}</span>}
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Link this company to the business owner's accounting in Dalilacom. When you mark a payroll run as paid, its cost is added there as one expense, so the owner sees the real profit after salaries.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Only totals are sent: the period, the currency, the total cost and the number of employees. No names and no individual salaries ever leave this system.
            </p>
          </div>

          {message && (
            <p className={`rounded-lg px-3 py-2 text-sm ${message.kind === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{message.text}</p>
          )}

          {info && !info.configured && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">The accounting link is not set up on this server yet, so it cannot be used for now. Please contact support.</p>
          )}

          {info?.status === "ACTIVE" ? (
            <div className="card space-y-4 p-5">
              <dl className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Linked since</dt>
                  <dd className="font-medium text-slate-900">{formatDate(info.connectedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Waiting to be sent</dt>
                  <dd className="font-medium text-slate-900">{info.pending}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Not sent (needs a retry)</dt>
                  <dd className={`font-medium ${info.failed > 0 ? "text-rose-700" : "text-slate-900"}`}>{info.failed}</dd>
                </div>
              </dl>
              {info.failed > 0 && <p className="text-xs text-slate-500">Open Payroll to see which runs were not sent and retry them.</p>}

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                <button
                  className="btn-secondary"
                  disabled={backfill.isPending}
                  onClick={() => {
                    if (window.confirm("Send every run that was marked as paid before the link? Each one is added to the accounting as an expense, in the month it was worked.")) backfill.mutate();
                  }}
                >
                  Send earlier paid runs
                </button>
                <button
                  className="btn-secondary text-rose-700"
                  disabled={disconnect.isPending}
                  onClick={() => {
                    if (window.confirm("Cancel the link? New payroll runs will stop going to accounting. Expenses already added stay there.")) disconnect.mutate();
                  }}
                >
                  <Unlink size={15} />
                  Cancel the link
                </button>
              </div>
              <p className="text-xs text-slate-500">Runs paid before the link are not sent by themselves, so the owner's past months do not change without them asking.</p>
            </div>
          ) : (
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                setMessage(null);
                connect.mutate();
              }}
              className="card space-y-3 p-5"
            >
              {info?.status === "REVOKED" && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">The business owner cancelled the link in Dalilacom. Nothing is sent now. Paste a new code to link again.</p>
              )}
              <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
                <li>In Dalilacom, open Accounting and choose the HR link option to make a link code.</li>
                <li>Paste the code here. It works once and expires after 30 minutes.</li>
              </ol>
              <label className="block text-xs text-slate-600">
                Link code
                <input
                  className="input-field mt-1 font-mono"
                  placeholder="dlk_…"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
              </label>
              <button type="submit" className="btn-primary" disabled={connect.isPending || !info?.configured || code.trim().length < 20}>
                {connect.isPending ? "Linking…" : "Link"}
              </button>
            </form>
          )}
        </div>
      )}
    </AppShell>
  );
}
