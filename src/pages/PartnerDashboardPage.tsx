import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bell,
  LayoutGrid,
  Leaf,
  List,
  LogOut,
  Search,
  Settings,
  ShoppingCart,
  Users,
  X,
} from 'lucide-react';
import type { AppPage } from '../types/page';
import { WelloraLogoMark } from '../components/WelloraLogoMark';

interface PartnerDashboardPageProps {
  onNavigate: (page: AppPage) => void;
}

type PartnerSection = 'dashboard' | 'userList' | 'menu';

type GuidanceStatus = 'Normal' | 'Monitor' | 'Needs Attention';

const HEADER_PROFILE_IMG =
  'https://images.unsplash.com/photo-1573496359142-b8d87734a21a?auto=format&fit=crop&w=120&h=120&q=80';

interface AssignedUser {
  name: string;
  email: string;
  photo: string;
  bmi: string;
  goal: string;
  dietary: string;
}

const ASSIGNED_USERS: AssignedUser[] = [
  {
    name: 'John Doe',
    email: 'john.doe@example.com',
    photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=96&h=96&q=80',
    bmi: '24.5',
    goal: 'Muscle Gain',
    dietary: 'Omnivore',
  },
  {
    name: 'Jane Smith',
    email: 'jane.smith@example.com',
    photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=96&h=96&q=80',
    bmi: '21.2',
    goal: 'Weight Loss',
    dietary: 'Vegetarian',
  },
  {
    name: 'Robert Johnson',
    email: 'robert.j@example.com',
    photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=96&h=96&q=80',
    bmi: '27.8',
    goal: 'Endurance',
    dietary: 'Omnivore',
  },
  {
    name: 'Emily White',
    email: 'emily.w@example.com',
    photo: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=96&h=96&q=80',
    bmi: '23.0',
    goal: 'Maintain Health',
    dietary: 'Vegan',
  },
  {
    name: 'Michael Brown',
    email: 'michael.b@example.com',
    photo: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=96&h=96&q=80',
    bmi: '25.1',
    goal: 'Muscle Gain',
    dietary: 'Omnivore',
  },
  {
    name: 'Sarah Davis',
    email: 'sarah.d@example.com',
    photo: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=96&h=96&q=80',
    bmi: '22.8',
    goal: 'Weight Loss',
    dietary: 'Pescatarian',
  },
];

interface GuidanceUserRow extends AssignedUser {
  status: GuidanceStatus;
  action: 'view_summary' | 'give_guidance';
  recentActivity: string;
}

const GUIDANCE_TABLE_ROWS: GuidanceUserRow[] = [
  {
    ...ASSIGNED_USERS[0],
    status: 'Normal',
    action: 'view_summary',
    recentActivity: 'Recent meals: Balanced macros',
  },
  {
    ...ASSIGNED_USERS[1],
    status: 'Monitor',
    action: 'give_guidance',
    recentActivity: 'Recent meals: Lower calorie lunches',
  },
  {
    ...ASSIGNED_USERS[2],
    status: 'Needs Attention',
    action: 'give_guidance',
    recentActivity: 'Activity: Cardio 3× per week',
  },
  {
    ...ASSIGNED_USERS[3],
    status: 'Normal',
    action: 'give_guidance',
    recentActivity: 'Recent meals: Plant-forward choices',
  },
  {
    ...ASSIGNED_USERS[4],
    bmi: '26.1',
    status: 'Normal',
    action: 'give_guidance',
    recentActivity: 'Recent meals: High protein intake',
  },
  {
    ...ASSIGNED_USERS[5],
    status: 'Monitor',
    action: 'give_guidance',
    recentActivity: 'Recent meals: Omega-3 rich fish 2× week',
  },
];

const CREATE_USER_GOALS = ['Muscle Gain', 'Weight Loss', 'Endurance', 'Maintain Health'] as const;
const CREATE_USER_DIETARY = ['Omnivore', 'Vegetarian', 'Vegan', 'Pescatarian', 'Gluten-Free', 'Keto'] as const;
const GUIDANCE_TYPES = ['Nutrition', 'Exercise', 'Sleep & stress', 'General wellness'] as const;
const MEAL_CATEGORIES = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'] as const;

const GOAL_FILTER_OPTIONS = ['All goals', 'Muscle Gain', 'Weight Loss', 'Endurance', 'Maintain Health'] as const;
const STATUS_FILTER_OPTIONS = ['All statuses', 'Normal', 'Monitor', 'Needs Attention'] as const;

function goalPillClass(goal: string) {
  switch (goal) {
    case 'Muscle Gain':
      return 'bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200';
    case 'Weight Loss':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-200';
    case 'Maintain Health':
      return 'bg-teal-100 text-teal-800 dark:bg-teal-950/50 dark:text-teal-200';
    case 'Endurance':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200';
  }
}

function statusPillClass(status: GuidanceStatus) {
  switch (status) {
    case 'Normal':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200';
    case 'Monitor':
      return 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200';
    case 'Needs Attention':
      return 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

type ModalKind = null | 'createUser' | 'giveGuidance';

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-wellora focus:outline-none focus:ring-2 focus:ring-wellora/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500';
const selectClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-wellora focus:outline-none focus:ring-2 focus:ring-wellora/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
const labelClass = 'mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300';

export function PartnerDashboardPage({ onNavigate }: PartnerDashboardPageProps) {
  const [section, setSection] = useState<PartnerSection>('dashboard');
  const [goalFilter, setGoalFilter] = useState<(typeof GOAL_FILTER_OPTIONS)[number]>('All goals');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTER_OPTIONS)[number]>('All statuses');
  const [searchQuery, setSearchQuery] = useState('');

  const [modal, setModal] = useState<ModalKind>(null);
  const [guidanceTarget, setGuidanceTarget] = useState<GuidanceUserRow | null>(null);

  const [cuFullName, setCuFullName] = useState('');
  const [cuEmail, setCuEmail] = useState('');
  const [cuGoal, setCuGoal] = useState('');
  const [cuDietary, setCuDietary] = useState('');
  const [cuNotes, setCuNotes] = useState('');

  const [ggType, setGgType] = useState('');
  const [ggNotes, setGgNotes] = useState('');
  const [ggMealCategory, setGgMealCategory] = useState('');

  const closeModals = () => {
    setModal(null);
    setGuidanceTarget(null);
  };

  const openCreateUserModal = () => {
    setCuFullName('');
    setCuEmail('');
    setCuGoal('');
    setCuDietary('');
    setCuNotes('');
    setModal('createUser');
  };

  const openGiveGuidanceModal = (row: GuidanceUserRow) => {
    if (row.action !== 'give_guidance') return;
    setGgType('');
    setGgNotes('');
    setGgMealCategory('');
    setGuidanceTarget(row);
    setModal('giveGuidance');
  };

  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setModal(null);
        setGuidanceTarget(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal]);

  const filteredGuidanceUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return GUIDANCE_TABLE_ROWS.filter((row) => {
      if (goalFilter !== 'All goals' && row.goal !== goalFilter) return false;
      if (statusFilter !== 'All statuses' && row.status !== statusFilter) return false;
      if (q && !row.name.toLowerCase().includes(q) && !row.email.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [goalFilter, statusFilter, searchQuery]);

  const sidebarNavClass = (active: boolean) =>
    active
      ? 'flex w-full items-center gap-3 rounded-xl border-l-4 border-l-wellora bg-slate-100 py-2.5 pl-2 pr-3 text-left text-sm font-semibold text-slate-900 dark:bg-slate-800 dark:text-white'
      : 'flex w-full items-center gap-3 rounded-xl border-l-4 border-transparent px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800';

  return (
    <>
    <div className="flex min-h-dvh bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-8 flex items-center gap-2 px-1">
          <WelloraLogoMark size="md" />
          <span className="text-lg font-semibold tracking-tight text-wellora">Wellora</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          <button type="button" onClick={() => setSection('dashboard')} className={sidebarNavClass(section === 'dashboard')}>
            <LayoutGrid className="h-4 w-4 shrink-0" />
            Dashboard
          </button>
          <button type="button" onClick={() => setSection('userList')} className={sidebarNavClass(section === 'userList')}>
            <Users className="h-4 w-4 shrink-0" />
            User List &amp; Guidance
          </button>
          <button type="button" onClick={() => setSection('menu')} className={sidebarNavClass(section === 'menu')}>
            <List className="h-4 w-4 shrink-0" />
            Menu
          </button>
        </nav>
        <button
          type="button"
          onClick={() => onNavigate('login')}
          className="mt-auto flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Log Out
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-slate-50 dark:bg-slate-950">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <WelloraLogoMark size="sm" />
            <span className="font-semibold text-wellora">Wellora</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-full p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
            </button>
            <img
              src={HEADER_PROFILE_IMG}
              alt=""
              className="h-9 w-9 rounded-full object-cover ring-2 ring-slate-200 dark:ring-slate-700"
            />
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-auto bg-slate-50 p-6 dark:bg-slate-950">
          {section === 'dashboard' && (
            <div className="mx-auto max-w-7xl space-y-8">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Partner Dashboard</h1>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Partner Type</p>
                  <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">City Hospital</p>
                  <span className="mt-3 inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800 dark:bg-sky-950/60 dark:text-sky-200">
                    Hospital Partner
                  </span>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Assigned Users</p>
                  <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">450</p>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Active users linked to your organization.</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
                          <AlertCircle className="h-3.5 w-3.5" strokeWidth={2.5} />
                        </span>
                        Users Needing Attention
                      </p>
                      <p className="mt-2 text-3xl font-bold tabular-nums text-red-600 dark:text-red-400">12</p>
                      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        Users with unaddressed guidance or critical alerts.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Recent Assigned Users</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {ASSIGNED_USERS.map((u) => (
                    <div
                      key={u.email}
                      className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800/50"
                    >
                      <div className="flex gap-3">
                        <img
                          src={u.photo}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-slate-100 dark:ring-slate-600"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-900 dark:text-white">{u.name}</p>
                          <p className="truncate text-sm text-slate-500 dark:text-slate-400">{u.email}</p>
                        </div>
                      </div>
                      <dl className="mt-4 space-y-2 text-sm">
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500 dark:text-slate-400">BMI</dt>
                          <dd className="font-medium text-slate-900 dark:text-white">{u.bmi}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500 dark:text-slate-400">Goal</dt>
                          <dd className="text-right font-medium text-slate-900 dark:text-white">{u.goal}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500 dark:text-slate-400">Dietary</dt>
                          <dd className="font-medium text-slate-900 dark:text-white">{u.dietary}</dd>
                        </div>
                      </dl>
                      <button
                        type="button"
                        className="mt-5 w-full rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                      >
                        View Health Summary
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {section === 'userList' && (
            <div className="mx-auto max-w-7xl">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">User List &amp; Guidance</h1>
                  <button
                    type="button"
                    onClick={openCreateUserModal}
                    className="shrink-0 rounded-xl bg-wellora px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-wellora-hover"
                  >
                    Create User
                  </button>
                </div>

                <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
                  <select
                    value={goalFilter}
                    onChange={(e) => setGoalFilter(e.target.value as (typeof GOAL_FILTER_OPTIONS)[number])}
                    className="min-w-[160px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    aria-label="Filter by goal"
                  >
                    <option value="All goals">Filter by Goal</option>
                    <option value="Muscle Gain">Muscle Gain</option>
                    <option value="Weight Loss">Weight Loss</option>
                    <option value="Endurance">Endurance</option>
                    <option value="Maintain Health">Maintain Health</option>
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as (typeof STATUS_FILTER_OPTIONS)[number])}
                    className="min-w-[160px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    aria-label="Filter by status"
                  >
                    <option value="All statuses">Filter by Status</option>
                    <option value="Normal">Normal</option>
                    <option value="Monitor">Monitor</option>
                    <option value="Needs Attention">Needs Attention</option>
                  </select>
                  <div className="relative flex min-w-0 flex-1 lg:min-w-[240px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Name or email"
                      className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
                    />
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    aria-label="Settings"
                  >
                    <Settings className="h-5 w-5" />
                  </button>
                </div>

                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Users that this partner has guided</p>

                <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="w-full min-w-[880px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
                        <th className="px-4 py-3 font-semibold">Name</th>
                        <th className="px-4 py-3 font-semibold">BMI</th>
                        <th className="px-4 py-3 font-semibold">Goal</th>
                        <th className="px-4 py-3 font-semibold">Dietary Type</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-900">
                      {filteredGuidanceUsers.map((row) => (
                        <tr key={row.email} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <img
                                src={row.photo}
                                alt=""
                                className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-slate-100 dark:ring-slate-600"
                              />
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900 dark:text-white">{row.name}</p>
                                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{row.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-medium tabular-nums text-slate-900 dark:text-white">{row.bmi}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${goalPillClass(row.goal)}`}
                            >
                              {row.goal}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                              {row.dietary}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusPillClass(row.status)}`}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() =>
                                row.action === 'give_guidance' ? openGiveGuidanceModal(row) : undefined
                              }
                              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                            >
                              {row.action === 'view_summary' ? 'View Health Summary' : 'Give Guidance'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {section === 'menu' && (
            <div className="mx-auto max-w-7xl space-y-6">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Menu</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Browse meal options linked to your partner program.</p>
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
                <ShoppingCart className="mx-auto mb-3 h-10 w-10 text-slate-400" />
                Partner menu catalog will appear here.
              </div>
            </div>
          )}
        </main>
      </div>
    </div>

    {modal === 'createUser' && (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        role="presentation"
        onClick={closeModals}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-user-title"
          className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4">
            <h2 id="create-user-title" className="text-xl font-bold text-slate-900 dark:text-white">
              Create User
            </h2>
            <button
              type="button"
              onClick={closeModals}
              className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              closeModals();
            }}
          >
            <div>
              <label className={labelClass} htmlFor="cu-full-name">
                Full Name
              </label>
              <input
                id="cu-full-name"
                className={inputClass}
                placeholder="Enter full name"
                value={cuFullName}
                onChange={(e) => setCuFullName(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="cu-email">
                Email
              </label>
              <input
                id="cu-email"
                type="email"
                className={inputClass}
                placeholder="Enter email address"
                value={cuEmail}
                onChange={(e) => setCuEmail(e.target.value)}
              />
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                A magic link with login credentials will be sent to this email.
              </p>
            </div>
            <div>
              <label className={labelClass} htmlFor="cu-goal">
                Goal
              </label>
              <select
                id="cu-goal"
                className={selectClass}
                value={cuGoal}
                onChange={(e) => setCuGoal(e.target.value)}
              >
                <option value="">Select goal</option>
                {CREATE_USER_GOALS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="cu-dietary">
                Dietary Preference
              </label>
              <select
                id="cu-dietary"
                className={selectClass}
                value={cuDietary}
                onChange={(e) => setCuDietary(e.target.value)}
              >
                <option value="">Select dietary preference</option>
                {CREATE_USER_DIETARY.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="cu-notes">
                Notes (optional)
              </label>
              <textarea
                id="cu-notes"
                rows={3}
                className={inputClass}
                placeholder="Additional notes (optional)"
                value={cuNotes}
                onChange={(e) => setCuNotes(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeModals}
                className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-wellora px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-wellora-hover"
              >
                Create &amp; Send Login Link
              </button>
            </div>
            <p className="text-center text-xs text-slate-500 dark:text-slate-400">
              An email with login credentials will be sent automatically.
            </p>
          </form>
        </div>
      </div>
    )}

    {modal === 'giveGuidance' && guidanceTarget && (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        role="presentation"
        onClick={closeModals}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="give-guidance-title"
          className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4">
            <h2 id="give-guidance-title" className="text-xl font-bold text-slate-900 dark:text-white">
              Give Guidance
            </h2>
            <button
              type="button"
              onClick={closeModals}
              className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-6 flex gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <img
              src={guidanceTarget.photo}
              alt=""
              className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-white dark:ring-slate-600"
            />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-900 dark:text-white">{guidanceTarget.name}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{guidanceTarget.email}</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{guidanceTarget.recentActivity}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <span className="rounded-md bg-slate-200/90 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-600 dark:text-slate-200">
                BMI {guidanceTarget.bmi}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                <Leaf className="h-3 w-3 shrink-0" strokeWidth={2.5} />
                {guidanceTarget.goal}
              </span>
            </div>
          </div>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              closeModals();
            }}
          >
            <div>
              <label className={labelClass} htmlFor="gg-type">
                Guidance Type
              </label>
              <select
                id="gg-type"
                className={selectClass}
                value={ggType}
                onChange={(e) => setGgType(e.target.value)}
              >
                <option value="">Select guidance type</option>
                {GUIDANCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="gg-notes">
                Guidance Notes
              </label>
              <textarea
                id="gg-notes"
                rows={4}
                className={inputClass}
                placeholder="Enter guidance notes here..."
                value={ggNotes}
                onChange={(e) => setGgNotes(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="gg-meal">
                Recommend Meal Category (optional)
              </label>
              <select
                id="gg-meal"
                className={selectClass}
                value={ggMealCategory}
                onChange={(e) => setGgMealCategory(e.target.value)}
              >
                <option value="">Select meal category</option>
                {MEAL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeModals}
                className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                Save
              </button>
              <button
                type="submit"
                className="rounded-xl bg-wellora px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-wellora-hover"
              >
                Save &amp; Notify User
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
    </>
  );
}
