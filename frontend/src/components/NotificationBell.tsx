import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { api } from "../lib/api";
import type { AppNotification } from "../lib/types";

function timeAgo(iso: string) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const notifications = useQuery({
    queryKey: ["notifications", "me"],
    queryFn: async () => (await api.get<{ notifications: AppNotification[]; unreadCount: number }>("/notifications/me")).data,
    refetchInterval: 30000,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["notifications", "me"] });
  }

  const markRead = useMutation({
    mutationFn: async (id: string) => (await api.post(`/notifications/${id}/read`)).data,
    onSuccess: invalidate,
  });
  const markAllRead = useMutation({
    mutationFn: async () => (await api.post("/notifications/read-all")).data,
    onSuccess: invalidate,
  });

  const unreadCount = notifications.data?.unreadCount ?? 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        aria-label="Notifications"
      >
        <Bell size={18} strokeWidth={2} />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-medium text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="text-sm font-semibold text-slate-900">Notifications</span>
              {unreadCount > 0 && (
                <button onClick={() => markAllRead.mutate()} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {notifications.data?.notifications.length === 0 && (
                <p className="p-4 text-center text-xs text-slate-500">No notifications yet.</p>
              )}
              {notifications.data?.notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => !n.readAt && markRead.mutate(n.id)}
                  className={`cursor-pointer px-4 py-3 text-xs transition-colors hover:bg-slate-50 ${n.readAt ? "bg-white" : "bg-brand-50/60"}`}
                >
                  <p className="font-medium text-slate-900">{n.title}</p>
                  {n.body && <p className="mt-0.5 text-slate-500">{n.body}</p>}
                  <p className="mt-1 text-slate-400">{timeAgo(n.createdAt)}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
