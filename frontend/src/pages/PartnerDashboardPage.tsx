import { useState, useRef, useEffect } from "react";
import { Bell, LogOut, Menu, Users, UserCog, AlertCircle, FileText, Search } from "lucide-react";
import { ThemeToggle } from "../components/ThemeToggle";
import { WelloraLogoMark } from "../components/WelloraLogoMark";
import type { AppPage } from "../types/page";
import { getPublicMeals, type PublicMeal } from "../api/orders";

interface PartnerDashboardPageProps {
  onNavigate: (page: AppPage) => void;
}

export function PartnerDashboardPage({ onNavigate }: PartnerDashboardPageProps) {
  const [activeSection, setActiveSection] = useState<
    "dashboard" | "guidance" | "menu" | "profile"
  >("dashboard");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [meals, setMeals] = useState<PublicMeal[]>([]);
  const [menuSearch, setMenuSearch] = useState("");
  const [menuCategory, setMenuCategory] = useState("");
  const [selectedMealIds, setSelectedMealIds] = useState<number[]>([]);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const storedUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("wellora_user") || "{}") as {
        name?: string;
        email?: string;
        phone?: string;
        partner_type?: "hospital" | "gym";
        organization_name?: string;
        address?: string;
        registration_status?: string;
        approval_date?: string | null;
      };
    } catch {
      return {};
    }
  })();
  const partnerName =
    storedUser.organization_name ||
    localStorage.getItem("partner-organization-name") ||
    localStorage.getItem("wellora-partner-name") ||
    "City Hospital";
  const partnerTypeLabel = storedUser.partner_type === "gym" ? "Gym" : "Hospital";
  const registrationStatus =
    storedUser.registration_status === "approved" ? "Approved" : "Pending Approval";
  const approvalDate = storedUser.approval_date
    ? new Date(storedUser.approval_date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Not approved yet";

  const assignedUsers = [
    {
      id: 1,
      name: "John Doe",
      email: "john.doe@example.com",
      bmi: "24.5",
      goal: "Muscle Gain",
      dietary: "Omnivore",
      avatar:
        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=80&h=80&q=80",
    },
    {
      id: 2,
      name: "Jane Smith",
      email: "jane.smith@example.com",
      bmi: "21.2",
      goal: "Weight Loss",
      dietary: "Vegetarian",
      avatar:
        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=80&h=80&q=80",
    },
    {
      id: 3,
      name: "Robert Johnson",
      email: "robert.j@example.com",
      bmi: "27.8",
      goal: "Endurance",
      dietary: "Omnivore",
      avatar:
        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=80&h=80&q=80",
    },
    {
      id: 4,
      name: "Emily White",
      email: "emily.w@example.com",
      bmi: "23.0",
      goal: "Maintain Health",
      dietary: "Vegan",
      avatar:
        "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=80&h=80&q=80",
    },
    {
      id: 5,
      name: "Michael Brown",
      email: "michael.b@example.com",
      bmi: "25.1",
      goal: "Muscle Gain",
      dietary: "Omnivore",
      avatar:
        "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=80&h=80&q=80",
    },
    {
      id: 6,
      name: "Sarah Davis",
      email: "sarah.d@example.com",
      bmi: "22.8",
      goal: "Weight Loss",
      dietary: "Pescatarian",
      avatar:
        "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=80&h=80&q=80",
    },
  ];

  useEffect(() => {
    getPublicMeals().then(setMeals).catch(console.error);
  }, []);

  const filteredMeals = meals.filter((meal) => {
    const matchesSearch =
      !menuSearch ||
      meal.name.toLowerCase().includes(menuSearch.toLowerCase()) ||
      meal.dietary.toLowerCase().includes(menuSearch.toLowerCase());
    const matchesCategory = !menuCategory || meal.category === menuCategory;
    return matchesSearch && matchesCategory;
  });

  const toggleMeal = (mealId: number) => {
    setSelectedMealIds((prev) =>
      prev.includes(mealId)
        ? prev.filter((id) => id !== mealId)
        : [...prev, mealId],
    );
  };

  const handleLogout = () => {
    localStorage.removeItem("wellora_token");
    localStorage.removeItem("wellora_user");
    localStorage.removeItem("current-role");
    onNavigate("login");
  };

  // ─── Click outside profile menu ────────────────
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(e.target as Node)
      ) {
        setProfileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <aside className="flex h-full w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900 md:w-64">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-5 dark:border-slate-800">
            <WelloraLogoMark size="sm" />
            <span className="text-lg font-semibold text-wellora">Wellora</span>
          </div>
          <nav className="flex flex-1 flex-col space-y-1 p-3">
            <button
              type="button"
              onClick={() => setActiveSection("dashboard")}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                activeSection === "dashboard"
                  ? "bg-slate-200 font-medium dark:bg-slate-800"
                  : "hover:bg-slate-100 dark:hover:bg-slate-800/70"
              }`}
            >
              <Users className="h-4 w-4" />
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => onNavigate("partner-guidance")}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                activeSection === "guidance"
                  ? "bg-slate-200 font-medium dark:bg-slate-800"
                  : "hover:bg-slate-100 dark:hover:bg-slate-800/70"
              }`}
            >
              <UserCog className="h-4 w-4" />
              User List & Guidance
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("menu")}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                activeSection === "menu"
                  ? "bg-slate-200 font-medium dark:bg-slate-800"
                  : "hover:bg-slate-100 dark:hover:bg-slate-800/70"
              }`}
            >
              <Menu className="h-4 w-4" />
              Menu
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("profile")}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                activeSection === "profile"
                  ? "bg-slate-200 font-medium dark:bg-slate-800"
                  : "hover:bg-slate-100 dark:hover:bg-slate-800/70"
              }`}
            >
              <FileText className="h-4 w-4" />
              Profile
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-auto flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
            >
              <LogOut className="h-4 w-4" />
              Log Out
            </button>
          </nav>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white dark:bg-slate-900">
          <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <WelloraLogoMark size="sm" />
              <span className="font-semibold text-wellora">Wellora</span>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <button
                type="button"
                className="rounded-full p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Bell className="h-5 w-5" />
              </button>
              <div className="relative" ref={profileMenuRef}>
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((o) => !o)}
                  className="rounded-full ring-2 ring-slate-200 transition hover:ring-wellora/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wellora dark:ring-slate-700"
                  aria-label="Open profile menu"
                >
                  <img
                    src="https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=80&h=80&q=80"
                    alt="Partner profile"
                    className="h-8 w-8 rounded-full object-cover"
                  />
                </button>
                {profileMenuOpen && (
                  <div className="absolute right-0 z-10 mt-2 w-40 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <LogOut className="h-4 w-4 text-red-600" /> Log Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto p-6 lg:p-8">
            {activeSection === "dashboard" && (
            <>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                Partner Dashboard
              </h1>

              <section className="mt-6 grid gap-4 md:grid-cols-4">
                <article className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Partner Type</p>
                  <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
                    {partnerName}
                  </p>
                  <span className="mt-2 inline-block rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    {partnerTypeLabel} Partner
                  </span>
                </article>
                <article className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Total Assigned Users</p>
                  <p className="mt-2 text-4xl font-bold text-slate-900 dark:text-white">450</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Active users linked to your organization.
                  </p>
                </article>
                <article className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Pending Guidance</p>
                  <p className="mt-2 text-4xl font-bold text-slate-900 dark:text-white">18</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Open user follow-ups this week.</p>
                </article>
                <article className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Users Needing Attention
                    </p>
                    <AlertCircle className="h-4 w-4 text-rose-500" />
                  </div>
                  <p className="mt-2 text-4xl font-bold text-rose-500">12</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Users with unaddressed guidance or critical alerts.
                  </p>
                </article>
              </section>

              <section className="mt-4 grid gap-4 md:grid-cols-2">
                <article className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Recommended Meals Sent</p>
                  <p className="mt-2 text-4xl font-bold text-slate-900 dark:text-white">73</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Recommendations delivered to users in the last 30 days.</p>
                </article>
                <article className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Recent Activity</p>
                  <div className="mt-3 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                    <p>Jane Smith received nutrition advice.</p>
                    <p>Robert Johnson was marked Needs Attention.</p>
                    <p>3 meal recommendations were sent today.</p>
                  </div>
                </article>
              </section>

              <section className="mt-8">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                  Recent Assigned Users
                </h2>

                <div className="mt-4 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                  {assignedUsers.map((user) => (
                    <article
                      key={user.id}
                      className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={user.avatar}
                          alt={user.name}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {user.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {user.email}
                          </p>
                        </div>
                      </div>
                      <dl className="mt-4 space-y-1 text-sm">
                        <div className="flex justify-between">
                          <dt className="text-slate-500 dark:text-slate-400">BMI:</dt>
                          <dd className="text-slate-800 dark:text-slate-200">{user.bmi}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-500 dark:text-slate-400">Goal:</dt>
                          <dd className="text-slate-800 dark:text-slate-200">{user.goal}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-500 dark:text-slate-400">Dietary:</dt>
                          <dd className="text-slate-800 dark:text-slate-200">{user.dietary}</dd>
                        </div>
                      </dl>
                      <button
                        type="button"
                        className="mt-4 w-full rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        View Health Summary
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            </>
            )}

            {activeSection === "menu" && (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Menu</h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Browse all vendor-published meals and recommend them to users.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={selectedMealIds.length === 0}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Recommend Meal
                  </button>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_180px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={menuSearch}
                      onChange={(e) => setMenuSearch(e.target.value)}
                      placeholder="Search global menu"
                      className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm dark:border-slate-600 dark:bg-slate-800"
                    />
                  </div>
                  <select
                    value={menuCategory}
                    onChange={(e) => setMenuCategory(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  >
                    <option value="">All Categories</option>
                    <option value="Breakfast">Breakfast</option>
                    <option value="Lunch">Lunch</option>
                    <option value="Dinner">Dinner</option>
                    <option value="Snacks">Snacks</option>
                  </select>
                </div>
                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredMeals.map((meal) => (
                    <button
                      key={meal.id}
                      type="button"
                      onClick={() => toggleMeal(meal.id)}
                      className={`rounded-xl border p-4 text-left transition ${
                        selectedMealIds.includes(meal.id)
                          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                          : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                      }`}
                    >
                      <p className="font-semibold text-slate-900 dark:text-white">{meal.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{meal.category} · {meal.calories} kcal</p>
                      <p className="mt-1 text-sm text-slate-500">Rs {meal.price.toFixed(2)} · {meal.dietary}</p>
                    </button>
                  ))}
                </div>
              </>
            )}

            {activeSection === "profile" && (
              <>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Profile</h1>
                <section className="mt-6 grid gap-4 md:grid-cols-2">
                  {[
                    ["Organization Name", partnerName],
                    ["Partner Type", partnerTypeLabel],
                    ["Email", storedUser.email || "partner@wellora.com"],
                    ["Phone", storedUser.phone || "+94 77 123 4567"],
                    ["Address", storedUser.address || "Colombo, Sri Lanka"],
                    ["Registration Status", registrationStatus],
                    ["Approval Date", approvalDate],
                  ].map(([label, value]) => (
                    <article key={label} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
                      <p className="mt-2 text-sm font-medium text-slate-900 dark:text-white">{value}</p>
                    </article>
                  ))}
                </section>
                <button className="mt-6 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                  Edit Profile
                </button>
              </>
            )}
          </main>
        </div>
    </div>
  );
}
