import { useEffect, useState, useRef } from "react";
import { getUserProfile, updateUserProfile } from "../api/user";
import {
  Bell,
  CheckCircle2,
  Flower2,
  Home,
  LogOut,
  Settings,
  ShoppingCart,
  Star,
  Upload,
} from "lucide-react";
import type { AppPage } from "../types/page";
import { WelloraLogoMark } from "../components/WelloraLogoMark";
import { BackButton } from "../components/BackButton";

interface SettingsPageProps {
  onNavigate: (page: AppPage) => void;
}

const PROFILE_IMG =
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&h=200&q=80";

type SettingsTab = "profile" | "health" | "partner" | "logout";
type Gender = "male" | "female" | "other";

const isGender = (value: unknown): value is Gender =>
  value === "male" || value === "female" || value === "other";

export function SettingsPage({ onNavigate }: SettingsPageProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [tab, setTab] = useState<SettingsTab>("profile");
  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<Gender>("female");
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getUserProfile().then((data) => {
      if (data) {
        setFullName(data.name ?? "");
        setEmail(data.email ?? "");
        setGender(isGender(data.gender) ? data.gender : "female");
      }
    });
  }, []);

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100 lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden">
      <div className="flex w-full flex-1 flex-col lg:min-h-0 lg:flex-row">
        {/* Sidebar */}
        <aside className="shrink-0 border-b border-slate-200 bg-white px-4 py-6 dark:border-slate-800 dark:bg-slate-900 lg:flex lg:h-full lg:w-64 lg:min-h-0 lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="mb-6 flex items-center gap-2 px-2">
            <WelloraLogoMark size="md" />
            <span className="text-lg font-semibold tracking-tight text-wellora">
              Wellora
            </span>
          </div>
          <nav className="space-y-1">
            <button
              type="button"
              onClick={() => onNavigate("user-dashboard")}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Home className="h-4 w-4 shrink-0" />
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => onNavigate("user-meal-recommendations")}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Star className="h-4 w-4 shrink-0" />
              Meal Recommendations
            </button>
            <button
              type="button"
              onClick={() => onNavigate("user-menu-order")}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ShoppingCart className="h-4 w-4 shrink-0" />
              Menu & Order
            </button>
            <button
              type="button"
              onClick={() => onNavigate("user-wellness")}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Flower2 className="h-4 w-4 shrink-0" />
              Wellness
            </button>
          </nav>
          <div className="my-5 border-t border-slate-200 dark:border-slate-700" />
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-xl bg-slate-100 px-3 py-2.5 text-left text-sm font-semibold text-slate-900 dark:bg-slate-800 dark:text-white"
          >
            <Settings className="h-4 w-4 shrink-0" />
            Settings
          </button>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-slate-50 dark:bg-slate-950">
          <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-6">
            <div className="flex items-center gap-3">
              <BackButton
                label="Dashboard"
                to="user-dashboard"
                onNavigate={onNavigate}
                className="lg:hidden"
              />
              <WelloraLogoMark size="sm" />
              <span className="font-semibold text-wellora">Wellora</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
              </button>
              <img
                src={PROFILE_IMG}
                alt=""
                className="h-9 w-9 rounded-full object-cover ring-2 ring-slate-100 dark:ring-slate-700"
              />
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">
              Profile Settings
            </h1>

            <div className="mt-6 flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700">
              {(
                [
                  { id: "profile" as const, label: "Profile Info" },
                  { id: "health" as const, label: "Health Profile" },
                  { id: "partner" as const, label: "Linked Partner" },
                  { id: "logout" as const, label: "Log Out" },
                ] as const
              ).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`relative px-4 py-3 text-sm font-semibold transition sm:text-base ${
                    tab === id
                      ? "text-wellora after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-wellora"
                      : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-6">
              {tab === "profile" && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-8">
                  <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
                    <img
                      src={PROFILE_IMG}
                      alt=""
                      className="h-24 w-24 shrink-0 rounded-full object-cover ring-2 ring-slate-100 dark:ring-slate-700"
                    />
                    <div>
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        aria-hidden
                      />
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        <Upload className="h-4 w-4" />
                        Upload Photo
                      </button>
                    </div>
                  </div>

                  <div className="mt-8 grid gap-5 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Full Name
                      </span>
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        readOnly={!isEditing}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-wellora focus:ring-1 focus:ring-wellora dark:border-slate-600 dark:bg-slate-800 dark:text-white read-only:opacity-80"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Email
                      </span>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        readOnly={!isEditing}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-wellora focus:ring-1 focus:ring-wellora dark:border-slate-600 dark:bg-slate-800 dark:text-white read-only:opacity-80"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Mobile Number
                      </span>
                      <input
                        type="tel"
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value)}
                        readOnly={!isEditing}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-wellora focus:ring-1 focus:ring-wellora dark:border-slate-600 dark:bg-slate-800 dark:text-white read-only:opacity-80"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Date of Birth
                      </span>
                      <input
                        type="date"
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                        readOnly={!isEditing}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-wellora focus:ring-1 focus:ring-wellora dark:border-slate-600 dark:bg-slate-800 dark:text-white read-only:opacity-80"
                      />
                    </label>
                  </div>

                  <fieldset className="mt-8">
                    <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Gender
                    </legend>
                    <div className="mt-3 flex flex-wrap gap-6">
                      {(["male", "female", "other"] as const).map((g) => (
                        <label
                          key={g}
                          className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300"
                        >
                          <input
                            type="radio"
                            name="gender"
                            checked={gender === g}
                            onChange={() => setGender(g)}
                            disabled={!isEditing}
                            className="h-4 w-4 accent-wellora disabled:opacity-60"
                          />
                          {g === "male"
                            ? "Male"
                            : g === "female"
                              ? "Female"
                              : "Other"}
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <div className="mt-8 flex justify-end">
                    {saveMsg && (
                      <p className="text-sm text-wellora font-medium">
                        {saveMsg}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        if (isEditing) {
                          setIsSaving(true);
                          try {
                            await updateUserProfile({ name: fullName, gender });
                            setSaveMsg("Profile saved!");
                            setTimeout(() => setSaveMsg(""), 3000);
                          } catch {
                            setSaveMsg("Failed to save.");
                          } finally {
                            setIsSaving(false);
                            setIsEditing(false);
                          }
                        } else {
                          setIsEditing(true);
                        }
                      }}
                      disabled={isSaving}
                      className="rounded-xl bg-wellora px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-wellora-hover"
                    >
                      {isSaving ? "Saving..." : isEditing ? "Save" : "Edit"}
                    </button>
                  </div>
                </div>
              )}

              {tab === "health" && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-8">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Health Profile
                  </h2>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    Height, weight, activity level, and health goals from
                    onboarding appear here. Connect a device or update your
                    profile to keep recommendations accurate.
                  </p>
                  <p className="mt-4 text-sm text-slate-500 dark:text-slate-500">
                    This section can be wired to your onboarding data and
                    wearables later.
                  </p>
                </div>
              )}

              {tab === "partner" && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-8">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                        Linked Partner
                      </h2>
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                        You are connected with a wellness partner for
                        personalized guidance.
                      </p>
                      <p className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">
                        Wellora Fitness
                      </p>
                    </div>
                    <CheckCircle2 className="h-8 w-8 shrink-0 text-wellora" />
                  </div>
                  <button
                    type="button"
                    className="mt-6 rounded-xl bg-wellora px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-wellora-hover"
                  >
                    View partner details
                  </button>
                </div>
              )}

              {tab === "logout" && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-8">
                  <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
                    <LogOut className="h-6 w-6" />
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                      Log out
                    </h2>
                  </div>
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                    You will need to sign in again to access your dashboard and
                    orders.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.clear();
                      onNavigate("login");
                    }}
                    className="mt-6 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
