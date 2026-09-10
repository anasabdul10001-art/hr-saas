import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
      <button onClick={() => setOpen(!open)} className="relative text-sm text-gray-600 underline">
        Notifications
        {unreadCount > 0 && (
          <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 p-3">
            <span className="text-xs font-medium text-gray-900">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={() => markAllRead.mutate()} className="text-xs text-gray-500 underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
            {notifications.data?.notifications.length === 0 && <p className="p-3 text-xs text-gray-500">No notifications.</p>}
            {notifications.data?.notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => !n.readAt && markRead.mutate(n.id)}
                className={`cursor-pointer p-3 text-xs ${n.readAt ? "bg-white" : "bg-blue-50"}`}
              >
                <p className="font-medium text-gray-900">{n.title}</p>
                {n.body && <p className="text-gray-500">{n.body}</p>}
                <p className="mt-1 text-gray-400">{timeAgo(n.createdAt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
