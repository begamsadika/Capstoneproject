import { useState, useRef, useEffect } from "react";
import { Bell, LogOut, Menu, Users, UserCog, AlertCircle, Search, Settings } from "lucide-react";
import { ThemeToggle } from "../components/ThemeToggle";
import { WelloraLogoMark } from "../components/WelloraLogoMark";
import type { AppPage } from "../types/page";

interface PartnerGuidanceProps {
  onNavigate: (page: AppPage) => void;
}

interface User {
  id: number;
  name: string;
  email: string;
  bmi: string;
  goal: string;
  dietary: string;
  status: "Normal" | "Monitor" | "Needs Attention";
  avatar: string;
}

export function PartnerGuidance({ onNavigate }: PartnerGuidanceProps) {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [filterGoal, setFilterGoal] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const partnerName =
    localStorage.getItem("partner-organization-name") ||
    localStorage.getItem("wellora-partner-name") ||
    "City Hospital";

  const users: User[] = [
    {
      id: 1,
      name: "John Doe",
      email: "john.doe@example.com",
      bmi: "24.5",
      goal: "Muscle Gain",
      dietary: "Omnivore",
      status: "Normal",
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
      status: "Monitor",
      avatar:
        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=80&h=80&q=80",
    },
    {
      id: 3,
      name: "Robert Johnson",
      email: "robert.j@example.com",
      bmi: "27.8",
      goal: "Weight Loss",
      dietary: "Omnivore",
      status: "Needs Attention",
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
      status: "Normal",
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
      status: "Monitor",
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
      status: "Normal",
      avatar:
        "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=80&h=80&q=80",
    },
    {
      id: 7,
      name: "Sarah Davis",
      email: "sarah.d@example.com",
      bmi: "22.8",
      goal: "Weight Loss",
      dietary: "Pescatarian",
      status: "Normal",
      avatar:
        "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=80&h=80&q=80",
    },
  ];

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

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGoal = !filterGoal || user.goal === filterGoal;
    const matchesStatus = !filterStatus || user.status === filterStatus;
    return matchesSearch && matchesGoal && matchesStatus;
  });

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "Normal":
        return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
      case "Monitor":
        return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
      case "Needs Attention":
        return "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300";
      default:
        return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    }
  };

  const getGoalBadgeColor = (goal: string) => {
    switch (goal) {
      case "Muscle Gain":
        return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
      case "Weight Loss":
        return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
      case "Maintain Health":
        return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
      case "Endurance":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
      default:
        return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    }
  };

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
            onClick={() => onNavigate("partner-dashboard")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800/70"
          >
            <Users className="h-4 w-4" />
            Dashboard
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg bg-slate-200 px-3 py-2 text-sm font-medium dark:bg-slate-800"
          >
            <UserCog className="h-4 w-4" />
            User List & Guidance
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800/70"
          >
            <Menu className="h-4 w-4" />
            Menu
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
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              User List & Guidance
            </h1>
            <button
              type="button"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Create User
            </button>
          </div>

          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:gap-3">
            <div className="flex-1">
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Filter by Goal
              </label>
              <select
                value={filterGoal}
                onChange={(e) => setFilterGoal(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              >
                <option value="">All Goals</option>
                <option value="Muscle Gain">Muscle Gain</option>
                <option value="Weight Loss">Weight Loss</option>
                <option value="Maintain Health">Maintain Health</option>
                <option value="Endurance">Endurance</option>
              </select>
            </div>

            <div className="flex-1">
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Filter by Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              >
                <option value="">All Status</option>
                <option value="Normal">Normal</option>
                <option value="Monitor">Monitor</option>
                <option value="Needs Attention">Needs Attention</option>
              </select>
            </div>

            <div className="flex-1">
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Name or email"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm dark:border-slate-600 dark:bg-slate-800"
                />
              </div>
            </div>

            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-slate-50 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              title="Settings"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>

          <div className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Users that user's <strong>partner has guided</strong>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    BMI
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Goal
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Dietary Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={user.avatar}
                          alt={user.name}
                          className="h-8 w-8 rounded-full object-cover"
                        />
                        <span className="font-medium text-slate-900 dark:text-white">
                          {user.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900 dark:text-white">
                      {user.bmi}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${getGoalBadgeColor(
                          user.goal
                        )}`}
                      >
                        {user.goal}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                      {user.dietary}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${getStatusBadgeColor(
                          user.status
                        )}`}
                      >
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        {user.status === "Normal" && (
                          <button
                            type="button"
                            className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                          >
                            View Health Summary
                          </button>
                        )}
                        {user.status !== "Normal" && (
                          <button
                            type="button"
                            className="text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                          >
                            Give Guidance
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}
