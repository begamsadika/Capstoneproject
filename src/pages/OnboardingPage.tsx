import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';

interface OnboardingPageProps {
  role: 'user' | 'vendor' | 'partner';
  onNavigate: (page: string) => void;
}

export function OnboardingPage({ role, onNavigate }: OnboardingPageProps) {
  // User specific states
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [height, setHeight] = useState<string>('');
  const [weight, setWeight] = useState<string>('');
  const [healthGoal, setHealthGoal] = useState<'lose' | 'maintain' | 'gain' | ''>('');
  const [dietaryPreferences, setDietaryPreferences] = useState<string>('');
  const [allergies, setAllergies] = useState<string>('');

  // Vendor specific states
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [foodSafetyCertificate, setFoodSafetyCertificate] = useState<File | null>(null);
  const [serviceArea, setServiceArea] = useState('');

  // Partner specific states
  const [organizationName, setOrganizationName] = useState('');
  const [partnerType, setPartnerType] = useState<'gym' | 'hospital' | null>(null);
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [uploadLicense, setUploadLicense] = useState<File | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    console.log(`Onboarding for ${role}:`);
    localStorage.setItem(`${role}-onboarding-complete`, 'true');
    localStorage.setItem(`${role}-admin-approved`, 'false'); // Set pending approval for vendor and partner

    if (role === 'user') {
      console.log({ gender, height, weight, healthGoal, dietaryPreferences, allergies });
      onNavigate('user-dashboard' as any);
    } else if (role === 'vendor') {
      console.log({ businessName, businessType, foodSafetyCertificate, serviceArea });
      onNavigate('pending-approval' as any);
    } else if (role === 'partner') {
      console.log({ organizationName, partnerType, registrationNumber, uploadLicense });
      onNavigate('pending-approval' as any);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 transition-colors duration-500 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBfiWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMwMDAiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDE2YzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptLTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTE2IDBjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OS00IDQgNCA0LTEuNzkgNC00em0tOCA4YzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptLTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTE2IDBjMC0yLjIxLTEuNzktNC00LTRsLTQgMS43OS00IDQgMS43OS00IDQgNCA0LTEuNzkgNC00em0tMTYgOGMwLTIuMjEtMS43OS00LTQtNHMtNCAxL7E5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-40 dark:opacity-20"></div>

      <div className="absolute top-6 left-6">
        <button
          onClick={() => onNavigate('login')}
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
        <div className="absolute inset-0 bg-gradient-to-r from-green-400 to-blue-500 rounded-3xl blur-2xl opacity-20"></div>
        <div className="relative bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/20 dark:border-gray-700/50">
          <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-2 text-center">
            {role === 'user' ? 'User Onboarding' : `${role.charAt(0).toUpperCase() + role.slice(1)} Onboarding`}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8 text-center">
            Please provide some initial details to personalize your experience.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {role === 'user' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Gender</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as 'male' | 'female')}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm rounded-md bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700 dark:text-white"
                    required
                  >
                    <option value="">Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>

                <div className="flex space-x-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Height (cm)</label>
                    <input
                      type="number"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700 dark:text-white py-3 pl-3"
                      placeholder="e.g., 175"
                      required
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Weight (kg)</label>
                    <input
                      type="number"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700 dark:text-white py-3 pl-3"
                      placeholder="e.g., 70"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Health Goal</label>
                  <select
                    value={healthGoal}
                    onChange={(e) => setHealthGoal(e.target.value as 'lose' | 'maintain' | 'gain')}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm rounded-md bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700 dark:text-white"
                    required
                  >
                    <option value="">Select Goal</option>
                    <option value="lose">Lose Weight</option>
                    <option value="maintain">Maintain Weight</option>
                    <option value="gain">Gain Weight</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Dietary Preferences (Optional)</label>
                  <input
                    type="text"
                    value={dietaryPreferences}
                    onChange={(e) => setDietaryPreferences(e.target.value)}
                    className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700 dark:text-white"
                    placeholder="e.g., Vegetarian, Vegan"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Allergies (Optional)</label>
                  <input
                    type="text"
                    value={allergies}
                    onChange={(e) => setAllergies(e.target.value)}
                    className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700 dark:text-white"
                    placeholder="e.g., Peanuts, Gluten"
                  />
                </div>
              </>
            )}

            {role === 'vendor' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Name</label>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Type</label>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Food Safety Certificate</label>
                  <input
                    type="file"
                    onChange={(e) => setFoodSafetyCertificate(e.target.files ? e.target.files[0] : null)}
                    className="mt-1 block w-full text-sm text-gray-700 dark:text-gray-300
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-full file:border-0
                      file:text-sm file:font-semibold
                      file:bg-green-50 file:text-green-700
                      hover:file:bg-green-100"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Service Area</label>
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

            {role === 'partner' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Organization Name</label>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Partner Type</label>
                  <select
                    value={partnerType || ''}
                    onChange={(e) => setPartnerType(e.target.value as 'gym' | 'hospital')}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm rounded-md bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700 dark:text-white"
                    required
                  >
                    <option value="">Select Partner Type</option>
                    <option value="gym">Gym</option>
                    <option value="hospital">Hospital</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Registration Number</label>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Upload License</label>
                  <input
                    type="file"
                    onChange={(e) => setUploadLicense(e.target.files ? e.target.files[0] : null)}
                    className="mt-1 block w-full text-sm text-gray-700 dark:text-gray-300
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-full file:border-0
                      file:text-sm file:font-semibold
                      file:bg-green-50 file:text-green-700
                      hover:file:bg-green-100"
                    required
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-300"
            >
              {role === 'user' ? 'Finish & Go to Dashboard' : 'Submit for Approval'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
