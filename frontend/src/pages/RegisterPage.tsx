import { useRef, useState } from "react";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  ArrowLeft,
  Users,
  Building2,
  ShoppingBag,
  Phone,
  FileText,
  MapPin,
} from "lucide-react";
import { ThemeToggle } from "../components/ThemeToggle";
import { WelloraLogoMark } from "../components/WelloraLogoMark";
import { InlineLoader } from "../components/LoadingStates";
import { registerUser } from "../api/auth";
import {
  normalizeEmail,
  normalizeSpaces,
  validateConfirmPassword,
  validateEmail,
  validateFullName,
  validateOrganizationName,
  validatePassword,
  validatePhone,
  validateRequired,
} from "../utils/authValidation";
import { getApiDetail, getApiFieldErrors } from "../utils/apiError";

type Page =
  | "home"
  | "login"
  | "register"
  | "verification"
  | "pending-approval"
  | "onboarding-user";

interface RegisterPageProps {
  onNavigate: (page: Page, email?: string) => void;
}

type UserType = "general" | "partner" | "vendor" | null;
type RegisterField =
  | "name"
  | "phone"
  | "email"
  | "organizationName"
  | "tinNumber"
  | "companyRegistrationNumber"
  | "address"
  | "password"
  | "confirmPassword"
  | "partnerType"
  | "terms";

export function RegisterPage({ onNavigate }: RegisterPageProps) {
  const [step, setStep] = useState<"userType" | "form">("userType");
  const [userType, setUserType] = useState<UserType>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [partnerType, setPartnerType] = useState<"hospital" | "gym" | "">("");
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    organizationName: "",
    tinNumber: "",
    companyRegistrationNumber: "",
    address: "",
    password: "",
    confirmPassword: "",
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RegisterField, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<RegisterField, boolean>>>({});
  const fieldRefs = {
    name: useRef<HTMLInputElement>(null),
    phone: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    organizationName: useRef<HTMLInputElement>(null),
    tinNumber: useRef<HTMLInputElement>(null),
    companyRegistrationNumber: useRef<HTMLInputElement>(null),
    address: useRef<HTMLTextAreaElement>(null),
    password: useRef<HTMLInputElement>(null),
    confirmPassword: useRef<HTMLInputElement>(null),
    terms: useRef<HTMLInputElement>(null),
  };

  const isBusinessAccount = userType === "partner" || userType === "vendor";

  const validateRegisterField = (field: RegisterField, value?: string) => {
    let message = "";
    if (field === "name") message = validateFullName(value ?? formData.name);
    if (field === "email") message = validateEmail(value ?? formData.email);
    if (field === "phone") message = validatePhone(value ?? formData.phone, isBusinessAccount);
    if (field === "organizationName") message = isBusinessAccount ? validateOrganizationName(value ?? formData.organizationName) : "";
    if (field === "tinNumber") message = isBusinessAccount ? validateRequired(value ?? formData.tinNumber, "TIN number is required.") : "";
    if (field === "companyRegistrationNumber") message = isBusinessAccount ? validateRequired(value ?? formData.companyRegistrationNumber, "Company registration number is required.") : "";
    if (field === "address") message = isBusinessAccount ? validateRequired(value ?? formData.address, "Address is required.") : "";
    if (field === "password") message = validatePassword(value ?? formData.password, formData.email);
    if (field === "confirmPassword") message = validateConfirmPassword(value ?? formData.confirmPassword, formData.password);
    if (field === "partnerType") message = userType === "partner" && !partnerType ? "Select a partner type." : "";
    if (field === "terms") message = termsAccepted ? "" : "You must agree to the Terms & Conditions and Privacy Policy to continue.";
    setFieldErrors((prev) => ({ ...prev, [field]: message || undefined }));
    return message;
  };

  const validateForm = () => {
    const fields: RegisterField[] = [
      "name",
      "email",
      "phone",
      "organizationName",
      "tinNumber",
      "companyRegistrationNumber",
      "address",
      "password",
      "confirmPassword",
      "partnerType",
      "terms",
    ];
    const nextErrors: Partial<Record<RegisterField, string>> = {};
    fields.forEach((field) => {
      const message = validateRegisterField(field);
      if (message) nextErrors[field] = message;
    });
    setTouched(Object.fromEntries(fields.map((field) => [field, true])) as Partial<Record<RegisterField, boolean>>);
    setFieldErrors(nextErrors);
    const firstInvalid = fields.find((field) => nextErrors[field]);
    if (firstInvalid === "partnerType") return false;
    if (firstInvalid) fieldRefs[firstInvalid as keyof typeof fieldRefs]?.current?.focus();
    return Object.keys(nextErrors).length === 0;
  };

  const inputClass = (field: RegisterField) =>
    `w-full rounded-xl border bg-gray-50 py-3.5 pr-4 text-gray-800 outline-none transition-all placeholder-gray-400 focus:border-transparent focus:ring-2 dark:bg-gray-900/50 dark:text-white ${
      fieldErrors[field]
        ? "border-red-300 focus:ring-red-500 dark:border-red-700"
        : "border-gray-200 focus:ring-wellora dark:border-gray-700"
    }`;

  const onFieldChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError("");
    const mappedField = field as RegisterField;
    if (touched[mappedField] || fieldErrors[mappedField]) validateRegisterField(mappedField, value);
  };

  const handleContinueFromUserType = () => {
    if (userType) {
      setStep("form");
    } else {
      setFieldErrors((prev) => ({ ...prev, terms: "Select an account type." }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const registration = await registerUser({
        name: normalizeSpaces(formData.name),
        email: normalizeEmail(formData.email),
        password: formData.password,
        phone: normalizeSpaces(formData.phone),
        user_type: userType || "general",
        partner_type: userType === "partner" ? partnerType : undefined,
        organization_name:
          userType === "partner" || userType === "vendor"
            ? normalizeSpaces(formData.organizationName)
            : undefined,
        tin_number:
          userType === "partner" || userType === "vendor"
            ? normalizeSpaces(formData.tinNumber)
            : undefined,
        company_registration_number:
          userType === "partner" || userType === "vendor"
            ? normalizeSpaces(formData.companyRegistrationNumber)
            : undefined,
        address:
          userType === "partner" || userType === "vendor"
            ? normalizeSpaces(formData.address)
            : undefined,
      });

      if (registration.access_token) {
        localStorage.setItem("wellora_token", registration.access_token);
      }
      if (registration.user) {
        localStorage.setItem("wellora_user", JSON.stringify(registration.user));
      }

      if (userType === "partner" || userType === "vendor") {
        const applicationType = userType === "partner" ? "Partner" : "Vendor";
        localStorage.setItem(
          "pending-approval-application",
          JSON.stringify({
            applicationType,
            partnerType: userType === "partner" ? partnerType : "",
            organizationName: normalizeSpaces(formData.organizationName),
            email: normalizeEmail(formData.email),
            status: "Pending Approval",
            submittedDate: new Date().toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
            applicationId: `${applicationType.slice(0, 3).toUpperCase()}-${registration.user?.id ?? Date.now()}`,
          }),
        );
        setSuccess(
          userType === "vendor"
            ? "Your vendor registration has been submitted successfully and is awaiting administrator approval."
            : "Your partner registration has been submitted successfully and is awaiting administrator approval.",
        );
        setTimeout(() => onNavigate("pending-approval"), 800);
        return;
      }

      setSuccess(registration.message || "Your account has been created successfully.");
      setTimeout(() => onNavigate("onboarding-user"), 800);
    } catch (err: unknown) {
      const errors = getApiFieldErrors(err);
      if (errors) {
        const mappedErrors: Partial<Record<RegisterField, string>> = {
          ...errors,
          organizationName: errors.organization_name,
          tinNumber: errors.tin_number,
          companyRegistrationNumber: errors.company_registration_number,
        };
        setFieldErrors(mappedErrors);
        const firstField = Object.keys(mappedErrors).find((field) => mappedErrors[field as RegisterField]) as RegisterField | undefined;
        if (firstField && firstField in fieldRefs) {
          fieldRefs[firstField as keyof typeof fieldRefs].current?.focus();
        }
      }
      setError(getApiDetail(err, "Registration failed. Try again."));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage:
            'url("https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=1400&q=80")',
        }}
      ></div>
      <div className="absolute inset-0 bg-gradient-to-br from-black/55 via-black/45 to-emerald-900/45 dark:from-black/70 dark:via-black/60 dark:to-black/60"></div>

      <div className="relative flex min-h-screen w-full items-center justify-center p-6">
        {/* The existing background pattern is now applied only to the form wrapper */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMwMDAiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDE2YzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptLTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTE2IDBjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OS00IDQgNCA0LTEuNzkgNC00em0tOCA4Yz Pedro-Mi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptLTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTE2IDBjMC0yLjIxLTEuNzktNC00LTRsLTQgMS43OS00IDQgMS43OS00IDQgNCA0LTEuNzkgNC00em0tMTYgOGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-40 dark:opacity-20 z-0"></div>

        {/* Existing absolute elements for back button and theme toggle */}
        <div className="absolute top-6 left-6 z-30">
          <button
            onClick={() =>
              step === "userType" ? onNavigate("home") : setStep("userType")
            }
            className="flex items-center space-x-2 text-white/90 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">
              {step === "userType" ? "Back to Home" : "Back"}
            </span>
          </button>
        </div>

        <div className="absolute top-6 right-6 z-30">
          <ThemeToggle />
        </div>

        <div className="relative z-10 w-full max-w-md animate-fade-in">
          <div className="absolute inset-0 bg-wellora/25 rounded-3xl blur-2xl opacity-40"></div>

          <div className="relative bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/20 dark:border-gray-700/50">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center mb-4">
                <WelloraLogoMark size="xl" />
              </div>
              <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">
                Create Account
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                {step === "userType"
                  ? "Select your account type"
                  : "Start your journey to better nutrition"}
              </p>
            </div>

            {step === "userType" ? (
              <div className="space-y-4">
                <button
                  onClick={() => setUserType("general")}
                  className={`w-full p-6 rounded-2xl border-2 transition-all duration-300 flex items-center space-x-4 ${
                    userType === "general"
                      ? "border-wellora bg-wellora-light dark:bg-wellora/10"
                      : "border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/30 hover:border-wellora/40"
                  }`}
                >
                  <div
                    className={`p-3 rounded-xl ${userType === "general" ? "bg-wellora" : "bg-gray-400"}`}
                  >
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-gray-800 dark:text-white">
                      General User
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Find nutrition and health tips
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => setUserType("partner")}
                  className={`w-full p-6 rounded-2xl border-2 transition-all duration-300 flex items-center space-x-4 ${
                    userType === "partner"
                      ? "border-wellora-dark bg-wellora-soft dark:bg-wellora/10"
                      : "border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/30 hover:border-wellora/40"
                  }`}
                >
                  <div
                    className={`p-3 rounded-xl ${userType === "partner" ? "bg-wellora-dark" : "bg-gray-400"}`}
                  >
                    <Building2 className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-gray-800 dark:text-white">
                      Partner
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Gym / Hospital / Clinic
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => setUserType("vendor")}
                  className={`w-full p-6 rounded-2xl border-2 transition-all duration-300 flex items-center space-x-4 ${
                    userType === "vendor"
                      ? "border-wellora bg-wellora-surface dark:bg-wellora/10"
                      : "border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/30 hover:border-wellora/40"
                  }`}
                >
                  <div
                    className={`p-3 rounded-xl ${userType === "vendor" ? "bg-wellora" : "bg-gray-400"}`}
                  >
                    <ShoppingBag className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-gray-800 dark:text-white">
                      Vendor
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Sell health products
                    </p>
                  </div>
                </button>

                <button
                  onClick={handleContinueFromUserType}
                  disabled={!userType}
                  className={`w-full py-4 rounded-xl font-semibold transition-all duration-300 mt-6 ${
                    userType
                      ? "bg-wellora text-white hover:bg-wellora-hover shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                      : "bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                  }`}
                >
                  Continue
                </button>

                <div className="mt-6 text-center">
                  <p className="text-gray-600 dark:text-gray-400">
                    Already have an account?{" "}
                    <button
                      onClick={() => onNavigate("login")}
                      className="text-wellora dark:text-wellora hover:text-wellora-dark font-semibold transition-colors"
                    >
                      Login
                    </button>
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      ref={fieldRefs.name}
                      type="text"
                      value={formData.name}
                      onBlur={() => {
                        setTouched((prev) => ({ ...prev, name: true }));
                        validateRegisterField("name");
                      }}
                      onChange={(e) => onFieldChange("name", e.target.value)}
                      placeholder="John Doe"
                      aria-invalid={Boolean(fieldErrors.name)}
                      aria-describedby={fieldErrors.name ? "register-name-error" : undefined}
                      autoComplete="name"
                      className={`${inputClass("name")} pl-12`}
                      required
                    />
                  </div>
                  {fieldErrors.name && <p id="register-name-error" className="text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.name}</p>}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      ref={fieldRefs.phone}
                      type="tel"
                      value={formData.phone}
                      onBlur={() => {
                        setTouched((prev) => ({ ...prev, phone: true }));
                        validateRegisterField("phone");
                      }}
                      onChange={(e) => onFieldChange("phone", e.target.value)}
                      placeholder="+94 71 234 5678"
                      aria-invalid={Boolean(fieldErrors.phone)}
                      aria-describedby={fieldErrors.phone ? "register-phone-error" : undefined}
                      autoComplete="tel"
                      className={`${inputClass("phone")} pl-12`}
                      required={isBusinessAccount}
                    />
                  </div>
                  {fieldErrors.phone && <p id="register-phone-error" className="text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.phone}</p>}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      ref={fieldRefs.email}
                      type="email"
                      value={formData.email}
                      onBlur={() => {
                        setTouched((prev) => ({ ...prev, email: true }));
                        validateRegisterField("email");
                      }}
                      onChange={(e) => onFieldChange("email", e.target.value)}
                      placeholder="your@email.com"
                      aria-invalid={Boolean(fieldErrors.email)}
                      aria-describedby={fieldErrors.email ? "register-email-error" : undefined}
                      autoComplete="email"
                      className={`${inputClass("email")} pl-12`}
                      required
                    />
                  </div>
                  {fieldErrors.email && <p id="register-email-error" className="text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.email}</p>}
                </div>

                {(userType === "partner" || userType === "vendor") && (
                  <>
                    {userType === "partner" && (
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Partner Type
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { value: "hospital" as const, label: "Hospital" },
                            { value: "gym" as const, label: "Gym" },
                          ].map((option) => (
                            <label
                              key={option.value}
                              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition ${
                                partnerType === option.value
                                  ? "border-wellora bg-wellora-light text-wellora-dark"
                                  : "border-gray-200 bg-gray-50 text-gray-700 hover:border-wellora/40 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-300"
                              }`}
                            >
                              <input
                                type="radio"
                                name="partnerType"
                                value={option.value}
                                checked={partnerType === option.value}
                                aria-invalid={Boolean(fieldErrors.partnerType)}
                                onChange={() => {
                                  setPartnerType(option.value);
                                  setFieldErrors((prev) => ({ ...prev, partnerType: undefined }));
                                }}
                                className="h-4 w-4 border-gray-300 text-wellora focus:ring-wellora"
                                required
                              />
                              {option.label}
                            </label>
                          ))}
                        </div>
                        {fieldErrors.partnerType && <p className="text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.partnerType}</p>}
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {userType === "vendor" ? "Business Name" : "Organization Name"}
                      </label>
                      <div className="relative">
                        <Building2 className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                        <input
                          ref={fieldRefs.organizationName}
                          type="text"
                          value={formData.organizationName}
                          onBlur={() => {
                            setTouched((prev) => ({ ...prev, organizationName: true }));
                            validateRegisterField("organizationName");
                          }}
                          onChange={(e) => onFieldChange("organizationName", e.target.value)}
                          placeholder={userType === "vendor" ? "Healthy Bites Inc." : "City Hospital"}
                          aria-invalid={Boolean(fieldErrors.organizationName)}
                          aria-describedby={fieldErrors.organizationName ? "register-org-error" : undefined}
                          className={`${inputClass("organizationName")} pl-12`}
                          required
                        />
                      </div>
                      {fieldErrors.organizationName && <p id="register-org-error" className="text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.organizationName}</p>}
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        TIN Number
                      </label>
                      <div className="relative">
                        <FileText className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                        <input
                          ref={fieldRefs.tinNumber}
                          type="text"
                          value={formData.tinNumber}
                          onBlur={() => {
                            setTouched((prev) => ({ ...prev, tinNumber: true }));
                            validateRegisterField("tinNumber");
                          }}
                          onChange={(e) => onFieldChange("tinNumber", e.target.value)}
                          placeholder="Tax Identification Number"
                          aria-invalid={Boolean(fieldErrors.tinNumber)}
                          aria-describedby={fieldErrors.tinNumber ? "register-tin-error" : undefined}
                          className={`${inputClass("tinNumber")} pl-12`}
                          required
                        />
                      </div>
                      {fieldErrors.tinNumber && <p id="register-tin-error" className="text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.tinNumber}</p>}
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Company Registration Number
                      </label>
                      <div className="relative">
                        <FileText className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                        <input
                          ref={fieldRefs.companyRegistrationNumber}
                          type="text"
                          value={formData.companyRegistrationNumber}
                          onBlur={() => {
                            setTouched((prev) => ({ ...prev, companyRegistrationNumber: true }));
                            validateRegisterField("companyRegistrationNumber");
                          }}
                          onChange={(e) => onFieldChange("companyRegistrationNumber", e.target.value)}
                          placeholder="Company registration number"
                          aria-invalid={Boolean(fieldErrors.companyRegistrationNumber)}
                          aria-describedby={fieldErrors.companyRegistrationNumber ? "register-company-error" : undefined}
                          className={`${inputClass("companyRegistrationNumber")} pl-12`}
                          required
                        />
                      </div>
                      {fieldErrors.companyRegistrationNumber && <p id="register-company-error" className="text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.companyRegistrationNumber}</p>}
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Address
                      </label>
                      <div className="relative">
                        <MapPin className="absolute left-4 top-4 h-5 w-5 text-gray-400" />
                        <textarea
                          ref={fieldRefs.address}
                          value={formData.address}
                          onBlur={() => {
                            setTouched((prev) => ({ ...prev, address: true }));
                            validateRegisterField("address");
                          }}
                          onChange={(e) => onFieldChange("address", e.target.value)}
                          placeholder="Registered business address"
                          rows={3}
                          aria-invalid={Boolean(fieldErrors.address)}
                          aria-describedby={fieldErrors.address ? "register-address-error" : undefined}
                          className={`${inputClass("address")} resize-none pl-12`}
                          required
                        />
                      </div>
                      {fieldErrors.address && <p id="register-address-error" className="text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.address}</p>}
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      ref={fieldRefs.password}
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onBlur={() => {
                        setTouched((prev) => ({ ...prev, password: true }));
                        validateRegisterField("password");
                      }}
                      onChange={(e) => {
                        onFieldChange("password", e.target.value);
                        if (touched.confirmPassword || fieldErrors.confirmPassword) {
                          validateRegisterField("confirmPassword");
                        }
                      }}
                      placeholder="Create a password"
                      aria-invalid={Boolean(fieldErrors.password)}
                      aria-describedby={fieldErrors.password ? "register-password-error" : "register-password-help"}
                      autoComplete="new-password"
                      className={`${inputClass("password")} pl-12 pr-12`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                  <p id="register-password-help" className="text-xs text-gray-500 dark:text-gray-400">
                    Use 8-64 characters with uppercase, lowercase, and special character.
                  </p>
                  {fieldErrors.password && <p id="register-password-error" className="text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.password}</p>}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      ref={fieldRefs.confirmPassword}
                      type={showConfirmPassword ? "text" : "password"}
                      value={formData.confirmPassword}
                      onBlur={() => {
                        setTouched((prev) => ({ ...prev, confirmPassword: true }));
                        validateRegisterField("confirmPassword");
                      }}
                      onChange={(e) => onFieldChange("confirmPassword", e.target.value)}
                      placeholder="Confirm your password"
                      aria-invalid={Boolean(fieldErrors.confirmPassword)}
                      aria-describedby={fieldErrors.confirmPassword ? "register-confirm-password-error" : undefined}
                      autoComplete="new-password"
                      className={`${inputClass("confirmPassword")} pl-12 pr-12`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                  {fieldErrors.confirmPassword && <p id="register-confirm-password-error" className="text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.confirmPassword}</p>}
                </div>

                <div className="flex items-start space-x-2 text-sm">
                  <input
                    ref={fieldRefs.terms}
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => {
                      setTermsAccepted(e.target.checked);
                      setFieldErrors((prev) => ({ ...prev, terms: e.target.checked ? undefined : prev.terms }));
                    }}
                    aria-invalid={Boolean(fieldErrors.terms)}
                    aria-describedby={fieldErrors.terms ? "register-terms-error" : undefined}
                    className="w-4 h-4 mt-0.5 rounded border-gray-300 text-wellora focus:ring-wellora"
                    required
                  />
                  <label className="text-gray-600 dark:text-gray-400">
                    I have read and agree to the{" "}
                    <a
                      href="/terms-of-service"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-wellora dark:text-wellora hover:text-wellora-dark font-medium"
                    >
                      Terms & Conditions
                    </a>{" "}
                    and{" "}
                    <a
                      href="/privacy-policy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-wellora dark:text-wellora hover:text-wellora-dark font-medium"
                    >
                      Privacy Policy
                    </a>
                    .
                  </label>
                </div>
                {fieldErrors.terms && <p id="register-terms-error" className="text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.terms}</p>}

                {/* Error message */}
                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                    <p className="text-red-600 dark:text-red-400 text-sm text-center">
                      {error}
                    </p>
                  </div>
                )}

                {/* Success message */}
                {success && (
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
                    <p className="text-green-600 dark:text-green-400 text-sm text-center">
                      {success}
                    </p>
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-4 bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? <InlineLoader label="Creating account..." /> : "Register"}
                </button>

                <div className="mt-6 text-center">
                  <p className="text-gray-600 dark:text-gray-400">
                    Already have an account?{" "}
                    <button
                      onClick={() => onNavigate("login")}
                      className="text-wellora dark:text-wellora hover:text-wellora-dark font-semibold transition-colors"
                    >
                      Login
                    </button>
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
