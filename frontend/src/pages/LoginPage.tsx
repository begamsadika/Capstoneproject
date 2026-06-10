import { useState } from "react";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  User,
  Store,
  Handshake,
  Check,
} from "lucide-react";
import { ThemeToggle } from "../components/ThemeToggle";
import { WelloraLogoMark } from "../components/WelloraLogoMark";
import { VendorStatus } from "../api/vendor";
import { loginUser } from "../api/auth";

interface LoginPageProps {
  onNavigate: (page: "home" | "register") => void;
  onLoginSuccess: (
    role: "user" | "vendor" | "partner",
    status?: VendorStatus,
  ) => void;
}

type Role = "user" | "vendor" | "partner";

const ROLES: {
  id: Role;
  label: string;
  description: string;
  icon: typeof User;
  accent: string;
}[] = [
  {
    id: "user",
    label: "User",
    description: "Find and enjoy healthy meals",
    icon: User,
    accent: "text-wellora",
  },
  {
    id: "vendor",
    label: "Vendor",
    description: "Sell and manage your meals",
    icon: Store,
    accent: "text-blue-500 dark:text-blue-400",
  },
  {
    id: "partner",
    label: "Partner",
    description: "Collaborate and grow with us",
    icon: Handshake,
    accent: "text-purple-500 dark:text-purple-400",
  },
];

export function LoginPage({ onNavigate, onLoginSuccess }: LoginPageProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setError("");
    setIsLoading(true);

    try {
      const data = await loginUser({ email, password });

      const actualRole = data.user.user_type;
      const selectedRole = role === "user" ? "general" : role;

      if (actualRole !== selectedRole) {
        setError(
          `This account is registered as "${actualRole}". Please select the correct role.`,
        );
        return;
      }

      localStorage.setItem("wellora_token", data.access_token);
      localStorage.setItem("wellora_user", JSON.stringify(data.user));

      if (rememberMe) {
        localStorage.setItem("wellora_remember", "true");
      } else {
        localStorage.removeItem("wellora_remember");
      }

      if (role === "vendor") {
        try {
          const { getVendorStatus } = await import("../api/vendor");
          const vendorStatus = await getVendorStatus();
          onLoginSuccess("vendor", vendorStatus);
        } catch {
          onLoginSuccess("vendor", "NEW");
        }
        return;
      }

      onLoginSuccess(role);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Invalid email or password.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-100 dark:bg-slate-950">
      <div
        className="absolute inset-0 scale-105 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage:
            'url("https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=1920&q=90")',
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-black/20 via-black/15 to-emerald-900/15 dark:from-black/35 dark:via-black/25 dark:to-emerald-950/30" />

      <div className="absolute top-6 left-6 z-30">
        <button
          type="button"
          onClick={() => onNavigate("home")}
          className="flex items-center gap-2 text-white/90 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="font-medium">Back to Home</span>
        </button>
      </div>

      <div className="absolute top-6 right-6 z-30">
        <ThemeToggle />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-lg animate-fade-in">
          <div className="absolute inset-0 rounded-2xl bg-wellora/20 opacity-30 blur-2xl dark:opacity-40" />

          <div className="relative rounded-2xl border border-white/40 bg-white/90 p-8 shadow-2xl backdrop-blur-xl dark:border-gray-700/50 dark:bg-gray-900/85">
            <div className="mb-8 text-center">
              <div className="mb-4 inline-flex">
                <WelloraLogoMark size="xl" />
              </div>
              <h2 className="mb-2 text-3xl font-bold text-gray-900 dark:text-white">
                Welcome Back
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Sign in to continue your healthy journey
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-800 dark:text-white">
                  Select Role
                </label>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {ROLES.map(({ id, label, description, icon: Icon, accent }) => {
                    const selected = role === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setRole(id)}
                        className={`relative flex flex-col items-center rounded-xl border px-2 py-3 text-center transition-all sm:px-3 sm:py-4 ${
                          selected
                            ? "border-wellora bg-wellora/10 dark:bg-wellora/10"
                            : "border-gray-200 bg-gray-50 hover:border-gray-300 dark:border-gray-600/70 dark:bg-gray-800/40 dark:hover:border-gray-500"
                        }`}
                      >
                        {selected && (
                          <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-wellora">
                            <Check
                              className="h-2.5 w-2.5 text-white"
                              strokeWidth={3}
                            />
                          </span>
                        )}
                        <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 sm:h-10 sm:w-10">
                          <Icon
                            className={`h-5 w-5 ${selected && id === "user" ? "text-wellora" : accent}`}
                          />
                        </div>
                        <span
                          className={`text-xs font-semibold sm:text-sm ${
                            selected && id === "user"
                              ? "text-wellora"
                              : "text-gray-800 dark:text-white"
                          }`}
                        >
                          {label}
                        </span>
                        <span className="mt-1 hidden text-[10px] leading-tight text-gray-500 dark:text-gray-400 sm:block sm:text-xs">
                          {description}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-center text-[11px] text-gray-500 dark:text-gray-400 sm:hidden">
                  {ROLES.find((r) => r.id === role)?.description}
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-800 dark:text-white">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 py-3.5 pl-12 pr-4 text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-wellora focus:ring-1 focus:ring-wellora dark:border-gray-600/70 dark:bg-gray-950/60 dark:text-white dark:placeholder:text-gray-500"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-800 dark:text-white">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 py-3.5 pl-12 pr-12 text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-wellora focus:ring-1 focus:ring-wellora dark:border-gray-600/70 dark:bg-gray-950/60 dark:text-white dark:placeholder:text-gray-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 bg-white text-wellora focus:ring-wellora focus:ring-offset-white dark:border-gray-500 dark:bg-gray-800 dark:focus:ring-offset-gray-900"
                  />
                  <span className="text-gray-600 dark:text-gray-400">
                    Remember me
                  </span>
                </label>
                <button
                  type="button"
                  className="font-medium text-wellora transition-colors hover:text-wellora-hover"
                >
                  Forgot password?
                </button>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800/60 dark:bg-red-900/30">
                  <p className="text-center text-sm text-red-600 dark:text-red-400">
                    {error}
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-lg bg-wellora py-4 font-semibold text-white shadow-lg transition-all hover:bg-wellora-hover disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoading ? "Signing in..." : "Login"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => onNavigate("register")}
                className="font-semibold text-wellora transition-colors hover:text-wellora-hover"
              >
                Create Account
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
