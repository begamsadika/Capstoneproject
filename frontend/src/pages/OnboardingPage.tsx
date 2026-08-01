import React, { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { ThemeToggle } from "../components/ThemeToggle";
import { submitVendorOnboarding } from "../api/vendor";
import { submitUserOnboarding } from "../api/user";

type Page =
  | "home"
  | "login"
  | "register"
  | "verification"
  | "onboarding-user"
  | "onboarding-vendor"
  | "onboarding-partner"
  | "pending"
  | "pending-approval"
  | "user-dashboard"
  | "vendor-dashboard"
  | "partner-dashboard";

interface OnboardingPageProps {
  role: "user" | "vendor" | "partner";
  onNavigate: (page: Page) => void;
}

export function OnboardingPage({ role, onNavigate }: OnboardingPageProps) {
  // User specific states
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [height, setHeight] = useState<string>("");
  const [weight, setWeight] = useState<string>("");
  const [healthGoal, setHealthGoal] = useState<
    "lose" | "maintain" | "gain" | ""
  >("");
  const [dietaryPreferences, setDietaryPreferences] = useState<string>("");
  const [allergies, setAllergies] = useState<string>("");
  const [medicalConditions, setMedicalConditions] = useState<string>("");
  const [medications, setMedications] = useState<string>("");

  // Vendor specific states
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [foodSafetyCertificate, setFoodSafetyCertificate] =
    useState<File | null>(null);
  const [serviceArea, setServiceArea] = useState("");

  // Partner specific states
  const [organizationName, setOrganizationName] = useState("");
  const [partnerType, setPartnerType] = useState<"gym" | "hospital" | null>(
    null,
  );
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [uploadLicense, setUploadLicense] = useState<File | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Mark onboarding as complete (frontend localStorage)
    localStorage.setItem(`${role}-onboarding-complete`, "true");
    localStorage.setItem(`${role}-admin-approved`, "false"); // pending approval for vendor and partner

    try {
      if (role === "user") {
        const formData = new FormData();
        formData.append("gender", gender);
        formData.append("height", height);
        formData.append("weight", weight);
        formData.append("healthGoal", healthGoal);
        formData.append("dietaryPreferences", dietaryPreferences || "");
        formData.append("allergies", allergies || "");
        formData.append("medicalConditions", medicalConditions || "");
        formData.append("medications", medications || "");

        await submitUserOnboarding(formData);
        localStorage.setItem("user-onboarding-complete", "true");
        onNavigate("user-dashboard");
      } else if (role === "vendor") {
        console.log({
          businessName,
          businessType,
          foodSafetyCertificate,
          serviceArea,
        });

        // ✅ FILE VALIDATION
        if (!foodSafetyCertificate) {
          alert("Please upload your Food Safety Certificate");
          setIsSubmitting(false);
          return;
        }

        const allowedTypes = ["application/pdf", "image/png", "image/jpeg"];
        const maxSize = 5 * 1024 * 1024; // 5 MB

        if (!allowedTypes.includes(foodSafetyCertificate.type)) {
          alert("Only PDF, PNG, or JPG files are allowed");
          setIsSubmitting(false);
          return;
        }

        if (foodSafetyCertificate.size > maxSize) {
          alert("File size must be less than 5MB");
          setIsSubmitting(false);
          return;
        }

        // ✅ CREATE FORM DATA
        const formData = new FormData();
        formData.append("businessName", businessName);
        formData.append("businessType", businessType);
        formData.append("serviceArea", serviceArea);
        formData.append("certificate", foodSafetyCertificate);

        // ✅ SEND TO BACKEND
        await submitVendorOnboarding(formData);

        onNavigate("pending"); // navigate to pending page after submission
      } else if (role === "partner") {
        console.log({
          organizationName,
          partnerType,
          registrationNumber,
          uploadLicense,
        });
        localStorage.setItem("partner-organization-name", organizationName);
        onNavigate("partner-dashboard");
      }
    } catch (error) {
      console.error("Onboarding failed:", error);
      alert("Something went wrong. Please try again.");
    }

    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-wellora-light via-white to-wellora-soft dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 transition-colors duration-500 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBfiWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMwMDAiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDE2YzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptLTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTE2IDBjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OS00IDQgNCA0LTEuNzkgNC00em0tOCA4YzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptLTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTE2IDBjMC0yLjIxLTEuNzktNC00LTRsLTQgMS43OS00IDQgMS43OS00IDQgNCA0LTEuNzkgNC00em0tMTYgOGMwLTIuMjEtMS43OS00LTQtNHMtNCAxL7E5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-40 dark:opacity-20"></div>

      <div className="absolute top-6 left-6">
        <button
          onClick={() => onNavigate("login")}
          className="flex items-center space-x-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Back to Login</span>
        </button>
      </div>

      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md relative">
        <div className="absolute inset-0 bg-wellora/25 rounded-3xl blur-2xl opacity-40"></div>
        <div className="relative bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/20 dark:border-gray-700/50">
          <h2 className="text-4xl font-bold text-gray-800 dark:text-white mb-2 text-center">
            {role === "user"
              ? "User Onboarding"
              : `${role.charAt(0).toUpperCase() + role.slice(1)} Onboarding`}
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 text-center">
            Please provide some initial details to personalize your experience.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {role === "user" && (
              <>
                <div>
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300">
                    Gender
                  </label>
                  <select
                    value={gender}
                    onChange={(e) =>
                      setGender(e.target.value as "male" | "female")
                    }
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-wellora focus:border-wellora sm:text-sm rounded-md bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700 dark:text-white"
                    required
                  >
                    <option value="">Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>

                <div className="flex space-x-4">
                  <div className="flex-1">
                    <label className="block text-base font-medium text-gray-700 dark:text-gray-300">
                      Height (cm)
                    </label>
                    <input
                      type="number"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700 dark:text-white py-3 pl-3 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="e.g., 175"
                      required
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-base font-medium text-gray-700 dark:text-gray-300">
                      Weight (kg)
                    </label>
                    <input
                      type="number"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700 dark:text-white py-3 pl-3 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="e.g., 70"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300">
                    Health Goal
                  </label>
                  <select
                    value={healthGoal}
                    onChange={(e) =>
                      setHealthGoal(
                        e.target.value as "lose" | "maintain" | "gain",
                      )
                    }
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-wellora focus:border-wellora sm:text-sm rounded-md bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700 dark:text-white"
                    required
                  >
                    <option value="">Select Goal</option>
                    <option value="lose">Lose Weight</option>
                    <option value="maintain">Maintain Weight</option>
                    <option value="gain">Gain Weight</option>
                  </select>
                </div>

                <div>
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300">
                    Dietary Preferences (Optional)
                  </label>
                  <textarea
                    value={dietaryPreferences}
                    onChange={(e) => setDietaryPreferences(e.target.value)}
                    className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700 dark:text-white py-3 pl-3 min-h-[80px] resize-none"
                    placeholder="e.g., Vegetarian, Vegan"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300">
                    Allergies (Optional)
                  </label>
                  <textarea
                    value={allergies}
                    onChange={(e) => setAllergies(e.target.value)}
                    className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700 dark:text-white py-3 pl-3 min-h-[80px] resize-none"
                    placeholder="e.g., Peanuts, Gluten"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300">
                    Medical Conditions (Optional)
                  </label>
                  <textarea
                    value={medicalConditions}
                    onChange={(e) => setMedicalConditions(e.target.value)}
                    maxLength={1000}
                    className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700 dark:text-white py-3 pl-3 min-h-[80px] resize-none"
                    placeholder="e.g., Type 2 diabetes, hypertension"
                    rows={3}
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Enter diagnosed conditions separated by commas.
                  </p>
                </div>

                <div>
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300">
                    Current Medications (Optional)
                  </label>
                  <textarea
                    value={medications}
                    onChange={(e) => setMedications(e.target.value)}
                    maxLength={1000}
                    className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700 dark:text-white py-3 pl-3 min-h-[80px] resize-none"
                    placeholder="e.g., Metformin, warfarin"
                    rows={3}
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Include medicine names only; never include account or prescription numbers.
                  </p>
                </div>
              </>
            )}

            {role === "vendor" && (
              <>
                <div>
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300">
                    Business Name
                  </label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700 dark:text-white py-3 pl-3"
                    placeholder="e.g., Healthy Bites Inc."
                    required
                  />
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300">
                    Business Type
                  </label>
                  <input
                    type="text"
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value)}
                    className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700 dark:text-white py-3 pl-3"
                    placeholder="e.g., Restaurant, Supplement Store"
                    required
                  />
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300">
                    Food Safety Certificate
                  </label>
                  <input
                    type="file"
                    onChange={(e) =>
                      setFoodSafetyCertificate(
                        e.target.files ? e.target.files[0] : null,
                      )
                    }
                    className="mt-1 block w-full text-sm text-gray-700 dark:text-gray-300
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-full file:border-0
                      file:text-sm file:font-semibold
                      file:bg-wellora-light file:text-wellora-dark
                      hover:file:bg-wellora-soft"
                    required
                  />
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300">
                    Service Area
                  </label>
                  <input
                    type="text"
                    value={serviceArea}
                    onChange={(e) => setServiceArea(e.target.value)}
                    className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700 dark:text-white py-3 pl-3"
                    placeholder="e.g., New York City, Online"
                    required
                  />
                </div>
              </>
            )}

            {role === "partner" && (
              <>
                <div>
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300">
                    Organization Name
                  </label>
                  <input
                    type="text"
                    value={organizationName}
                    onChange={(e) => setOrganizationName(e.target.value)}
                    className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700 dark:text-white py-3 pl-3"
                    placeholder="e.g., City Gym, General Hospital"
                    required
                  />
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300">
                    Partner Type
                  </label>
                  <select
                    value={partnerType || ""}
                    onChange={(e) =>
                      setPartnerType(e.target.value as "gym" | "hospital")
                    }
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-wellora focus:border-wellora sm:text-sm rounded-md bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700 dark:text-white"
                    required
                  >
                    <option value="">Select Partner Type</option>
                    <option value="gym">Gym</option>
                    <option value="hospital">Hospital</option>
                  </select>
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300">
                    Registration Number
                  </label>
                  <input
                    type="text"
                    value={registrationNumber}
                    onChange={(e) => setRegistrationNumber(e.target.value)}
                    className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700 dark:text-white py-3 pl-3"
                    placeholder="e.g., REG12345"
                    required
                  />
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300">
                    Upload License
                  </label>
                  <input
                    type="file"
                    onChange={(e) =>
                      setUploadLicense(
                        e.target.files ? e.target.files[0] : null,
                      )
                    }
                    className="mt-1 block w-full text-sm text-gray-700 dark:text-gray-300
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-full file:border-0
                      file:text-sm file:font-semibold
                      file:bg-wellora-light file:text-wellora-dark
                      hover:file:bg-wellora-soft"
                    required
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-wellora text-white hover:bg-wellora-hover rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting
                ? "Submitting…"
                : role === "user"
                  ? "Finish & Go to Dashboard"
                  : "Submit for Approval"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
