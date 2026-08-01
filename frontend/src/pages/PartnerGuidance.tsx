import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  FileText,
  History,
  LogOut,
  Menu,
  Search,
  Send,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { ThemeToggle } from "../components/ThemeToggle";
import { WelloraLogoMark } from "../components/WelloraLogoMark";
import { BackButton } from "../components/BackButton";
import { getPublicMeals, type PublicMeal } from "../api/orders";
import {
  createPartnerClient,
  getPartnerClients,
  recommendPartnerMeals,
  type CreatePartnerClientPayload,
} from "../api/partner";
import type { AppPage } from "../types/page";
import { getApiDetail, getApiStatus } from "../utils/apiError";

interface PartnerGuidanceProps {
  onNavigate: (page: AppPage) => void;
}

type PartnerUserStatus = "Active" | "Needs Attention" | "Inactive";
type ModalMode = "create" | "profile" | "guidance" | "meals" | "history" | null;

interface PartnerUser {
  id: number;
  name: string;
  email: string;
  bmi: string;
  goal: string;
  dietary: string;
  gender: string;
  age: number;
  status: PartnerUserStatus;
  assignedDate: string;
  healthConditions: string;
  recentOrders: string[];
  currentGuidance: string;
  avatar: string;
}

const USERS: PartnerUser[] = [
  {
    id: 1,
    name: "John Doe",
    email: "john.doe@example.com",
    bmi: "24.5",
    goal: "Muscle Gain",
    dietary: "Omnivore",
    gender: "Male",
    age: 31,
    status: "Active",
    assignedDate: "2026-06-18",
    healthConditions: "None reported",
    recentOrders: ["High Protein Bowl", "Grilled Chicken Salad"],
    currentGuidance: "Increase lean protein at lunch and maintain hydration.",
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
    gender: "Female",
    age: 28,
    status: "Needs Attention",
    assignedDate: "2026-06-22",
    healthConditions: "Mild hypertension",
    recentOrders: ["Vegetable Wrap", "Lentil Soup"],
    currentGuidance: "Reduce sodium and add post-meal walks.",
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
    gender: "Male",
    age: 45,
    status: "Needs Attention",
    assignedDate: "2026-06-30",
    healthConditions: "Pre-diabetes",
    recentOrders: ["Rice Bowl", "Chicken Curry"],
    currentGuidance: "Prioritize low glycemic meals this week.",
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
    gender: "Female",
    age: 36,
    status: "Active",
    assignedDate: "2026-07-01",
    healthConditions: "Lactose intolerance",
    recentOrders: ["Tofu Bowl", "Green Salad"],
    currentGuidance: "Keep protein variety across legumes, tofu, and seeds.",
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
    gender: "Male",
    age: 39,
    status: "Inactive",
    assignedDate: "2026-05-27",
    healthConditions: "None reported",
    recentOrders: ["Protein Pasta"],
    currentGuidance: "Pending follow-up.",
    avatar:
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=80&h=80&q=80",
  },
];

const HISTORY = [
  { date: "2026-07-05", partner: "City Hospital", type: "Meal Recommendation", status: "Sent" },
  { date: "2026-07-03", partner: "City Hospital", type: "Nutrition Advice", status: "Read" },
  { date: "2026-06-28", partner: "City Hospital", type: "Lifestyle Advice", status: "Sent" },
];

const emptyCreateForm: CreatePartnerClientPayload = {
  full_name: "",
  email: "",
  gender: "",
  age: undefined,
  fitness_goal: "",
  dietary_preference: "",
  notes: "",
};

export function PartnerGuidance({ onNavigate }: PartnerGuidanceProps) {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [filterGoal, setFilterGoal] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedUser, setSelectedUser] = useState<PartnerUser | null>(null);
  const [users, setUsers] = useState<PartnerUser[]>([]);
  const [isLoadingPartnerUsers, setIsLoadingPartnerUsers] = useState(true);
  const [meals, setMeals] = useState<PublicMeal[]>([]);
  const [mealSearch, setMealSearch] = useState("");
  const [mealCategory, setMealCategory] = useState("");
  const [selectedMealIds, setSelectedMealIds] = useState<number[]>([]);
  const [createForm, setCreateForm] = useState<CreatePartnerClientPayload>(emptyCreateForm);
  const [partnerActionMessage, setPartnerActionMessage] = useState("");
  const [partnerActionError, setPartnerActionError] = useState("");
  const [isPartnerActionSaving, setIsPartnerActionSaving] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    getPublicMeals().then(setMeals).catch(console.error);
    if (!localStorage.getItem("wellora_token")) {
      setPartnerActionError("Your session expired. Please log in as a partner again.");
      setIsLoadingPartnerUsers(false);
      onNavigate("login");
      return;
    }

    getPartnerClients()
      .then((clients) => {
        setUsers(
          clients.map((client, index) => ({
            id: client.id,
            name: client.name,
            email: client.email,
            bmi: "Pending",
            goal: client.fitness_goal || "Maintain Health",
            dietary: client.dietary_preference || "Not set",
            gender: client.gender || "Not set",
            age: client.age ?? 0,
            status: client.status,
            assignedDate: client.assigned_date,
            healthConditions: "To be completed by user",
            recentOrders: [],
            currentGuidance:
              client.invitation_status === "accepted"
                ? "Ready for guidance."
                : "Invitation sent. Waiting for password setup.",
            avatar: USERS[index % USERS.length].avatar,
          })),
        );
      })
      .catch((err) => {
        if (getApiStatus(err) === 401) {
          localStorage.removeItem("wellora_token");
          localStorage.removeItem("wellora_user");
          localStorage.removeItem("current-role");
          onNavigate("login");
          return;
        }
        setPartnerActionError(
          getApiDetail(err, "Unable to load partner clients."),
        );
      })
      .finally(() => setIsLoadingPartnerUsers(false));
  }, [onNavigate]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("wellora_token");
    localStorage.removeItem("wellora_user");
    localStorage.removeItem("current-role");
    onNavigate("login");
  };

  const openModal = (mode: ModalMode, user?: PartnerUser) => {
    setSelectedUser(user ?? null);
    setSelectedMealIds([]);
    setPartnerActionMessage("");
    setPartnerActionError("");
    if (mode === "create") setCreateForm(emptyCreateForm);
    setModalMode(mode);
  };

  const closeModal = () => {
    setModalMode(null);
    setSelectedUser(null);
    setSelectedMealIds([]);
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGoal = !filterGoal || user.goal === filterGoal;
    const matchesStatus = !filterStatus || user.status === filterStatus;
    const matchesDate = !filterDate || user.assignedDate >= filterDate;
    return matchesSearch && matchesGoal && matchesStatus && matchesDate;
  });

  const filteredMeals = useMemo(
    () =>
      meals.filter((meal) => {
        const matchesSearch =
          !mealSearch ||
          meal.name.toLowerCase().includes(mealSearch.toLowerCase()) ||
          meal.dietary.toLowerCase().includes(mealSearch.toLowerCase());
        const matchesCategory = !mealCategory || meal.category === mealCategory;
        return matchesSearch && matchesCategory;
      }),
    [meals, mealSearch, mealCategory],
  );

  const getStatusBadgeColor = (status: PartnerUserStatus) => {
    switch (status) {
      case "Active":
        return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
      case "Needs Attention":
        return "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300";
      case "Inactive":
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
      default:
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
    }
  };

  const toggleMeal = (mealId: number) => {
    setSelectedMealIds((prev) =>
      prev.includes(mealId) ? prev.filter((id) => id !== mealId) : [...prev, mealId],
    );
  };

  const handleCreateUser = async () => {
    setPartnerActionMessage("");
    setPartnerActionError("");
    if (!localStorage.getItem("wellora_token")) {
      setPartnerActionError("Your session expired. Please log in as a partner again.");
      onNavigate("login");
      return;
    }
    if (!createForm.full_name.trim() || !createForm.email.trim()) {
      setPartnerActionError("Full Name and Email are required.");
      return;
    }

    setIsPartnerActionSaving(true);
    try {
      const created = await createPartnerClient(createForm);
      setUsers((prev) => [
        {
          id: created.id,
          name: created.name,
          email: created.email,
          bmi: "Pending",
          goal: created.fitness_goal || "Maintain Health",
          dietary: created.dietary_preference || "Not set",
          gender: created.gender || "Not set",
          age: created.age ?? 0,
          status: created.status,
          assignedDate: created.assigned_date,
          healthConditions: "To be completed by user",
          recentOrders: [],
          currentGuidance: "Invitation sent. Waiting for password setup.",
          avatar: USERS[0].avatar,
        },
        ...prev,
      ]);
      setPartnerActionMessage(
        created.invitation_link
          ? `Invitation sent. Setup link: ${created.invitation_link}`
          : "Invitation sent to the user's email.",
      );
    } catch (err: unknown) {
      if (getApiStatus(err) === 401) {
        localStorage.removeItem("wellora_token");
        localStorage.removeItem("wellora_user");
        localStorage.removeItem("current-role");
        onNavigate("login");
      } else {
        setPartnerActionError(getApiDetail(err, "Failed to create user invitation."));
      }
    } finally {
      setIsPartnerActionSaving(false);
    }
  };

  const handleRecommendMeals = async () => {
    if (!selectedUser) return;
    setPartnerActionMessage("");
    setPartnerActionError("");
    if (!localStorage.getItem("wellora_token")) {
      setPartnerActionError("Your session expired. Please log in as a partner again.");
      onNavigate("login");
      return;
    }
    setIsPartnerActionSaving(true);
    try {
      await recommendPartnerMeals(selectedUser.id, selectedMealIds);
      setPartnerActionMessage("Recommended meals were sent to this user.");
      setSelectedMealIds([]);
    } catch (err: unknown) {
      if (getApiStatus(err) === 401) {
        localStorage.removeItem("wellora_token");
        localStorage.removeItem("wellora_user");
        localStorage.removeItem("current-role");
        onNavigate("login");
      } else {
        setPartnerActionError(getApiDetail(err, "Failed to send meal recommendations."));
      }
    } finally {
      setIsPartnerActionSaving(false);
    }
  };

  const navButton = (active = false) =>
    `flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm ${
      active ? "bg-slate-200 font-medium dark:bg-slate-800" : "hover:bg-slate-100 dark:hover:bg-slate-800/70"
    }`;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside className="flex h-full w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900 md:w-64">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-5 dark:border-slate-800">
          <WelloraLogoMark size="sm" />
          <span className="text-lg font-semibold text-wellora">Wellora</span>
        </div>
        <nav className="flex flex-1 flex-col space-y-1 p-3">
          <button type="button" onClick={() => onNavigate("partner-dashboard")} className={navButton()}>
            <Users className="h-4 w-4" /> Dashboard
          </button>
          <button type="button" className={navButton(true)}>
            <UserCog className="h-4 w-4" /> User List & Guidance
          </button>
          <button type="button" onClick={() => onNavigate("partner-dashboard")} className={navButton()}>
            <Menu className="h-4 w-4" /> Menu
          </button>
          <button type="button" onClick={() => onNavigate("partner-dashboard")} className={navButton()}>
            <FileText className="h-4 w-4" /> Profile
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-auto flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
          >
            <LogOut className="h-4 w-4" /> Log Out
          </button>
        </nav>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white dark:bg-slate-900">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <BackButton label="Dashboard" to="partner-dashboard" onNavigate={onNavigate} className="md:hidden" />
            <WelloraLogoMark size="sm" />
            <span className="font-semibold text-wellora">Wellora</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button type="button" className="rounded-full p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
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
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">User List & Guidance</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Manage assigned users, guidance, meal recommendations, and history.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openModal("create")}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              + Create User
            </button>
          </div>

          <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="grid gap-4 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Search Users</label>
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
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Goal</label>
                <select value={filterGoal} onChange={(e) => setFilterGoal(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800">
                  <option value="">All Goals</option>
                  <option value="Muscle Gain">Muscle Gain</option>
                  <option value="Weight Loss">Weight Loss</option>
                  <option value="Maintain Health">Maintain Health</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Status</label>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800">
                  <option value="">All Status</option>
                  <option value="Active">Active</option>
                  <option value="Needs Attention">Needs Attention</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Registration Date</label>
                <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" />
              </div>
            </div>
          </section>

          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full min-w-[980px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                  {["Avatar", "Name", "Email", "BMI", "Goal", "Assigned Date", "Status", "Actions"].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {isLoadingPartnerUsers && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                      Loading partner clients...
                    </td>
                  </tr>
                )}
                {!isLoadingPartnerUsers && filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                      No partner clients found. Use Create User to invite your first client.
                    </td>
                  </tr>
                )}
                {!isLoadingPartnerUsers && filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-4">
                      <img src={user.avatar} alt={user.name} className="h-9 w-9 rounded-full object-cover" />
                    </td>
                    <td className="px-4 py-4 font-medium text-slate-900 dark:text-white">{user.name}</td>
                    <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400">{user.email}</td>
                    <td className="px-4 py-4 text-sm">{user.bmi}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${getGoalBadgeColor(user.goal)}`}>
                        {user.goal}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400">{user.assignedDate}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${getStatusBadgeColor(user.status)}`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => openModal("profile", user)} className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200">View Profile</button>
                        <button type="button" onClick={() => openModal("guidance", user)} className="text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400">Give Guidance</button>
                        <button type="button" onClick={() => openModal("meals", user)} className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">Meal Recommendations</button>
                        <button type="button" onClick={() => openModal("history", user)} className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200">View History</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {modalMode === "create" && "Create User"}
                  {modalMode === "profile" && "User Profile"}
                  {modalMode === "guidance" && "Give Guidance"}
                  {modalMode === "meals" && "Meal Recommendations"}
                  {modalMode === "history" && "Guidance History"}
                </h2>
                {selectedUser && <p className="mt-1 text-sm text-slate-500">{selectedUser.name} · {selectedUser.email}</p>}
              </div>
              <button type="button" onClick={closeModal} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[calc(92vh-8rem)] overflow-y-auto p-5">
              {(partnerActionError || partnerActionMessage) && (
                <div
                  className={`mb-4 rounded-xl px-3 py-2 text-sm ${
                    partnerActionError
                      ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
                      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                  }`}
                >
                  {partnerActionError || partnerActionMessage}
                </div>
              )}
              {modalMode === "create" && (
                <CreateUserForm value={createForm} onChange={setCreateForm} />
              )}
              {modalMode === "profile" && selectedUser && <ProfileSummary user={selectedUser} />}
              {modalMode === "guidance" && <GuidanceForm />}
              {modalMode === "meals" && (
                <MealPicker
                  meals={filteredMeals}
                  mealSearch={mealSearch}
                  mealCategory={mealCategory}
                  selectedMealIds={selectedMealIds}
                  setMealSearch={setMealSearch}
                  setMealCategory={setMealCategory}
                  toggleMeal={toggleMeal}
                />
              )}
              {modalMode === "history" && <HistoryTimeline />}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
              <button type="button" onClick={closeModal} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button>
              {modalMode === "create" && (
                <button
                  type="button"
                  onClick={handleCreateUser}
                  disabled={isPartnerActionSaving}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPartnerActionSaving ? "Creating..." : "Create User"}
                </button>
              )}
              {modalMode === "guidance" && <button className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"><Send className="h-4 w-4" /> Save & Notify User</button>}
              {modalMode === "meals" && (
                <button
                  type="button"
                  onClick={handleRecommendMeals}
                  disabled={selectedMealIds.length === 0 || isPartnerActionSaving}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPartnerActionSaving ? "Sending..." : "Recommend"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateUserForm({
  value,
  onChange,
}: {
  value: CreatePartnerClientPayload;
  onChange: (value: CreatePartnerClientPayload) => void;
}) {
  const update = (
    key: keyof CreatePartnerClientPayload,
    nextValue: string | number | undefined,
  ) => {
    onChange({ ...value, [key]: nextValue });
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Full Name</span>
        <input value={value.full_name} onChange={(e) => update("full_name", e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Email</span>
        <input type="email" value={value.email} onChange={(e) => update("email", e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Gender</span>
        <input value={value.gender} onChange={(e) => update("gender", e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Age</span>
        <input type="number" value={value.age ?? ""} onChange={(e) => update("age", e.target.value ? Number(e.target.value) : undefined)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Fitness Goal</span>
        <input value={value.fitness_goal} onChange={(e) => update("fitness_goal", e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Dietary Preference</span>
        <input value={value.dietary_preference} onChange={(e) => update("dietary_preference", e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" />
      </label>
      <label className="block sm:col-span-2">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Notes (Optional)</span>
        <textarea value={value.notes} onChange={(e) => update("notes", e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" rows={4} />
      </label>
      <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 sm:col-span-2">
        Account will be generated and a login email sent. The user completes their profile after first login.
      </p>
    </div>
  );
}

function ProfileSummary({ user }: { user: PartnerUser }) {
  const rows = [
    ["Profile Information", `${user.gender}, ${user.age} years`],
    ["BMI", user.bmi],
    ["Goal", user.goal],
    ["Dietary Preference", user.dietary],
    ["Health Conditions", user.healthConditions],
    ["Recent Orders", user.recentOrders.join(", ")],
    ["Current Guidance", user.currentGuidance],
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-sm text-slate-900 dark:text-white">{value}</p>
        </div>
      ))}
    </div>
  );
}

function GuidanceForm() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Guidance Type</span>
          <select className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800">
            <option>Meal Recommendation</option>
            <option>Nutrition Advice</option>
            <option>Lifestyle Advice</option>
          </select>
        </label>
        <label>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Priority</span>
          <select className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800">
            <option>Normal</option>
            <option>High</option>
          </select>
        </label>
      </div>
      <label className="block">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Message</span>
        <textarea className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" rows={7} />
      </label>
    </div>
  );
}

function MealPicker({
  meals,
  mealSearch,
  mealCategory,
  selectedMealIds,
  setMealSearch,
  setMealCategory,
  toggleMeal,
}: {
  meals: PublicMeal[];
  mealSearch: string;
  mealCategory: string;
  selectedMealIds: number[];
  setMealSearch: (value: string) => void;
  setMealCategory: (value: string) => void;
  toggleMeal: (mealId: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <input value={mealSearch} onChange={(e) => setMealSearch(e.target.value)} placeholder="Search global menu" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" />
        <select value={mealCategory} onChange={(e) => setMealCategory(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800">
          <option value="">All Categories</option>
          <option value="Breakfast">Breakfast</option>
          <option value="Lunch">Lunch</option>
          <option value="Dinner">Dinner</option>
          <option value="Snacks">Snacks</option>
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {meals.map((meal) => (
          <button
            key={meal.id}
            type="button"
            onClick={() => toggleMeal(meal.id)}
            className={`rounded-xl border p-4 text-left transition ${selectedMealIds.includes(meal.id) ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"}`}
          >
            <p className="font-medium text-slate-900 dark:text-white">{meal.name}</p>
            <p className="mt-1 text-sm text-slate-500">{meal.category} · {meal.calories} kcal · Rs {meal.price.toFixed(2)}</p>
            <p className="mt-1 text-xs text-slate-500">{meal.dietary}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function HistoryTimeline() {
  return (
    <div className="space-y-3">
      {HISTORY.map((item) => (
        <div key={`${item.date}-${item.type}`} className="flex gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <div className="mt-1 rounded-full bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
            <History className="h-4 w-4" />
          </div>
          <div>
            <p className="font-medium text-slate-900 dark:text-white">{item.type}</p>
            <p className="mt-1 text-sm text-slate-500">{item.date} · {item.partner} · {item.status}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
