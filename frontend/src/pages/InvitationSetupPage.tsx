import { useState } from "react";
import { Lock, CheckCircle2 } from "lucide-react";
import { WelloraLogoMark } from "../components/WelloraLogoMark";
import { setInvitationPassword } from "../api/partner";
import type { AppPage } from "../types/page";

interface InvitationSetupPageProps {
  token: string;
  onNavigate: (page: AppPage) => void;
}

export function InvitationSetupPage({ token, onNavigate }: InvitationSetupPageProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSaving(true);
    try {
      const data = await setInvitationPassword(token, password);
      localStorage.setItem("wellora_token", data.access_token);
      localStorage.setItem("wellora_user", JSON.stringify(data.user));
      localStorage.setItem("current-role", "user");
      window.history.replaceState({}, "", window.location.pathname);
      onNavigate("onboarding-user");
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Invitation setup failed.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6 dark:bg-slate-950">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="mb-6 text-center">
          <div className="mb-4 inline-flex">
            <WelloraLogoMark size="xl" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Set Your Password
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Complete your Wellora invitation and continue as your partner's client.
          </p>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Password
          </span>
          <div className="relative mt-1.5">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </div>
        </label>

        <label className="mt-4 block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Confirm Password
          </span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
        </label>

        {error && (
          <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSaving}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-wellora px-4 py-3 text-sm font-semibold text-white hover:bg-wellora-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckCircle2 className="h-4 w-4" />
          {isSaving ? "Saving..." : "Set Password & Continue"}
        </button>
      </form>
    </div>
  );
}
