import { useState } from "react";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  ArrowLeft,
  Phone,
  Store,
  Handshake,
  Check,
} from "lucide-react";
import { ThemeToggle } from "../components/ThemeToggle";
import { WelloraLogoMark } from "../components/WelloraLogoMark";
import { loginUser, registerUser } from "../api/auth";
import type { VendorStatus } from "../api/vendor";

type Page = "home" | "login" | "register" | "verification";
type UserType = "general" | "partner" | "vendor";
type AppRole = "user" | "vendor" | "partner";

interface RegisterPageProps {
  onNavigate: (page: Page, email?: string) => void;
  onRegisterSuccess: (role: AppRole, status?: VendorStatus) => void;
}

function userTypeToRole(userType: UserType): AppRole {
  if (userType === "vendor") return "vendor";
  if (userType === "partner") return "partner";
  return "user";
}

const ROLE_OPTIONS: {
  id: UserType;
  label: string;
  description: string;
  icon: typeof User;
  accent: string;
}[] = [
  {
    id: "general",
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

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white py-3 pl-12 pr-4 text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-wellora focus:ring-1 focus:ring-wellora dark:border-gray-600/70 dark:bg-gray-950/40 dark:text-white dark:placeholder:text-gray-500";

export function RegisterPage({
  onNavigate,
  onRegisterSuccess,
}: RegisterPageProps) {
  const [step, setStep] = useState<"userType" | "form">("userType");
  const [userType, setUserType] = useState<UserType | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedRole = ROLE_OPTIONS.find((r) => r.id === userType);

  const handleContinueFromUserType = () => {
    if (userType) setStep("form");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match!");
      return;
    }

    if (!agreedToTerms) {
      setError("Please agree to the Terms of Service and Privacy Policy.");
      return;
    }

    setIsLoading(true);
    try {
      const selectedType = userType || "general";

      await registerUser({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        phone: formData.phone,
        user_type: selectedType,
      });

      const loginData = await loginUser({
        email: formData.email,
        password: formData.password,
      });

      localStorage.setItem("wellora_token", loginData.access_token);
      localStorage.setItem("wellora_user", JSON.stringify(loginData.user));

      const role = userTypeToRole(selectedType);

      if (role === "vendor") {
        try {
          const { getVendorStatus } = await import("../api/vendor");
          const vendorStatus = await getVendorStatus();
          onRegisterSuccess("vendor", vendorStatus);
        } catch {
          onRegisterSuccess("vendor", "NEW");
        }
        return;
      }

      onRegisterSuccess(role);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Registration failed. Try again.");
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
          onClick={() =>
            step === "userType" ? onNavigate("home") : setStep("userType")
          }
          className="flex items-center gap-2 text-white/90 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="font-medium">
            {step === "userType" ? "Back to Home" : "Back"}
          </span>
        </button>
      </div>

      <div className="absolute top-6 right-6 z-30">
        <ThemeToggle />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center p-6 py-24">
        <div className="w-full max-w-md animate-fade-in">
          <div className="absolute inset-0 rounded-2xl bg-wellora/20 opacity-30 blur-2xl dark:opacity-40" />

          <div className="relative rounded-2xl border border-white/40 bg-white/90 p-8 shadow-2xl backdrop-blur-xl dark:border-gray-700/50 dark:bg-gray-900/85">
            <div className="mb-6 text-center">
              <div className="mb-4 inline-flex">
                <WelloraLogoMark size="xl" />
              </div>
              <h2 className="mb-2 text-3xl font-bold text-gray-900 dark:text-white">
                Create Account
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {step === "userType"
                  ? "Select your account type"
                  : "Start your journey to better nutrition"}
              </p>
            </div>

            {step === "userType" ? (
              <div className="space-y-5">
                <label className="block text-sm font-medium text-gray-800 dark:text-white">
                  Select Role
                </label>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {ROLE_OPTIONS.map(
                    ({ id, label, description, icon: Icon, accent }) => {
                      const selected = userType === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setUserType(id)}
                          className={`relative flex flex-col items-center rounded-xl border px-2 py-3 text-center transition-all sm:px-3 sm:py-4 ${
                            selected
                              ? "border-wellora bg-wellora/10"
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
                              className={`h-5 w-5 ${selected && id === "general" ? "text-wellora" : accent}`}
                            />
                          </div>
                          <span
                            className={`text-xs font-semibold sm:text-sm ${
                              selected && id === "general"
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
                    },
                  )}
                </div>
                <p className="text-center text-[11px] text-gray-500 dark:text-gray-400 sm:hidden">
                  {selectedRole?.description}
                </p>

                {selectedRole && (
                  <p className="text-center text-sm text-gray-600 dark:text-gray-400">
                    Selected role:{" "}
                    <span className="font-semibold text-wellora">
                      {selectedRole.label}
                    </span>
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleContinueFromUserType}
                  disabled={!userType}
                  className="w-full rounded-lg bg-wellora py-4 font-semibold text-white shadow-lg transition-all hover:bg-wellora-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Continue
                </button>

                <p className="text-center text-sm text-gray-600 dark:text-gray-400">
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => onNavigate("login")}
                    className="font-semibold text-wellora transition-colors hover:text-wellora-hover"
                  >
                    Login
                  </button>
                </p>
              </div>
            ) : (
              <>
                {selectedRole && (
                  <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-wellora/25 bg-wellora/5 px-4 py-3 dark:bg-wellora/10">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-wellora/15 dark:bg-wellora/20">
                        <selectedRole.icon
                          className={`h-5 w-5 ${selectedRole.id === "general" ? "text-wellora" : selectedRole.accent}`}
                        />
                      </div>
                      <div className="text-left">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Registering as
                        </p>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {selectedRole.label}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep("userType")}
                      className="shrink-0 text-xs font-medium text-wellora hover:text-wellora-hover"
                    >
                      Change
                    </button>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-800 dark:text-white">
                      Full Name
                    </label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        placeholder="John Doe"
                        className={inputClass}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-800 dark:text-white">
                      Phone Number
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) =>
                          setFormData({ ...formData, phone: e.target.value })
                        }
                        placeholder="+94 71 234 5678"
                        className={inputClass}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-800 dark:text-white">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                        placeholder="your@email.com"
                        className={inputClass}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-800 dark:text-white">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={formData.password}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            password: e.target.value,
                          })
                        }
                        placeholder="Create a password"
                        className={`${inputClass} pr-12`}
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

                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-800 dark:text-white">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={formData.confirmPassword}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            confirmPassword: e.target.value,
                          })
                        }
                        placeholder="Confirm your password"
                        className={`${inputClass} pr-12`}
                        required
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowConfirmPassword(!showConfirmPassword)
                        }
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-5 w-5" />
                        ) : (
                          <Eye className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-wellora focus:ring-wellora dark:border-gray-500 dark:bg-gray-800"
                      required
                    />
                    <span className="text-gray-600 dark:text-gray-400">
                      I agree to the{" "}
                      <button
                        type="button"
                        className="font-medium text-wellora hover:text-wellora-hover"
                      >
                        Terms of Service
                      </button>{" "}
                      and{" "}
                      <button
                        type="button"
                        className="font-medium text-wellora hover:text-wellora-hover"
                      >
                        Privacy Policy
                      </button>
                    </span>
                  </label>

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
                    {isLoading ? "Creating account..." : "Register"}
                  </button>
                </form>

                <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => onNavigate("login")}
                    className="font-semibold text-wellora transition-colors hover:text-wellora-hover"
                  >
                    Login
                  </button>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
