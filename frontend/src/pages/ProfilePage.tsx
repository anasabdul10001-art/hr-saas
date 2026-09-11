import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { AppShell } from "../components/AppShell";
import { Avatar } from "../components/Avatar";
import { Logo } from "../components/Logo";

type Profile = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
  companyId: string | null;
};

function errorMessage(err: unknown, fallback: string) {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
}

function ProfileContent() {
  const { user, updateUser, logout } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: async () => (await api.get<Profile>("/profile")).data,
  });

  const [form, setForm] = useState({ name: "", email: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState(false);
  const [seeded, setSeeded] = useState(false);

  // Seed the form once, the first time the profile loads — after that, leave it alone so it
  // doesn't clobber an in-progress edit on background refetches.
  useEffect(() => {
    if (profile.data && !seeded) {
      setForm({ name: profile.data.name ?? "", email: profile.data.email });
      setSeeded(true);
    }
  }, [profile.data, seeded]);

  const saveProfile = useMutation({
    mutationFn: async () => (await api.patch<Profile>("/profile", form)).data,
    onSuccess: (data) => {
      updateUser({ name: data.name, email: data.email });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setFormSuccess(true);
      setFormError(null);
    },
    onError: (err: unknown) => setFormError(errorMessage(err, "Failed to update profile")),
  });

  function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setFormSuccess(false);
    saveProfile.mutate();
  }

  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("avatar", file);
      return (await api.post<Profile>("/profile/avatar", formData)).data;
    },
    onSuccess: (data) => {
      updateUser({ avatarUrl: data.avatarUrl });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (err: unknown) => alert(errorMessage(err, "Failed to upload photo")),
  });

  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const changePassword = useMutation({
    mutationFn: async () =>
      (await api.post("/profile/password", { currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword })).data,
    onSuccess: async () => {
      // The backend revokes every session on password change (same as reset-password), so the
      // current one needs a real re-login too rather than silently breaking on the next refresh.
      alert("Password updated. Please log in again.");
      await logout();
    },
    onError: (err: unknown) => setPasswordError(errorMessage(err, "Failed to change password")),
  });

  function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("New passwords don't match");
      return;
    }
    changePassword.mutate();
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-slate-900">Profile photo</h2>
        <div className="mt-3 flex items-center gap-4">
          <div className="relative">
            <Avatar name={user?.name} email={user?.email} avatarUrl={profile.data?.avatarUrl} size="lg" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadAvatar.isPending}
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm hover:bg-brand-700"
              aria-label="Change photo"
            >
              <Camera size={14} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadAvatar.mutate(file);
                e.target.value = "";
              }}
            />
          </div>
          <div className="text-xs text-slate-500">
            {uploadAvatar.isPending ? "Uploading…" : "JPG or PNG, up to 2MB."}
          </div>
        </div>
      </div>

      <form onSubmit={handleProfileSubmit} className="card space-y-4 p-6">
        <h2 className="text-sm font-semibold text-slate-900">Account details</h2>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Name</label>
          <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Email</label>
          <input
            type="email"
            className="input-field"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </div>
        {formError && <p className="text-sm text-rose-600">{formError}</p>}
        {formSuccess && !formError && <p className="text-sm text-emerald-600">Saved.</p>}
        <button type="submit" disabled={saveProfile.isPending} className="btn-primary">
          {saveProfile.isPending ? "Saving…" : "Save changes"}
        </button>
      </form>

      <form onSubmit={handlePasswordSubmit} className="card space-y-4 p-6">
        <h2 className="text-sm font-semibold text-slate-900">Change password</h2>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Current password</label>
          <input
            type="password"
            className="input-field"
            value={passwordForm.currentPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">New password</label>
          <input
            type="password"
            minLength={8}
            className="input-field"
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Confirm new password</label>
          <input
            type="password"
            minLength={8}
            className="input-field"
            value={passwordForm.confirmPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
            required
          />
        </div>
        {passwordError && <p className="text-sm text-rose-600">{passwordError}</p>}
        <button type="submit" disabled={changePassword.isPending} className="btn-primary">
          {changePassword.isPending ? "Updating…" : "Change password"}
        </button>
      </form>
    </div>
  );
}

export function ProfilePage() {
  const { user } = useAuth();

  if (user?.role === "SUPER_ADMIN") {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-800 bg-slate-900">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link to="/admin">
              <Logo compact />
            </Link>
            <Link to="/admin" className="text-sm text-slate-300 hover:text-white">
              Back to admin
            </Link>
          </div>
        </header>
        <main className="p-6">
          <ProfileContent />
        </main>
      </div>
    );
  }

  return (
    <AppShell title="Profile">
      <ProfileContent />
    </AppShell>
  );
}
