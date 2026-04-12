import { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, User, ArrowLeft, Users, Building2, ShoppingBag, Phone } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import { WelloraLogoMark } from '../components/WelloraLogoMark';

type Page = 'home' | 'login' | 'register' | 'verification';

interface RegisterPageProps {
  onNavigate: (page: Page, email?: string) => void;
}

type UserType = 'general' | 'partner' | 'vendor' | null;

export function RegisterPage({ onNavigate }: RegisterPageProps) {
  const [step, setStep] = useState<'userType' | 'form'>('userType');
  const [userType, setUserType] = useState<UserType>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const handleContinueFromUserType = () => {
    if (userType) {
      setStep('form');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Register:', { userType, ...formData });
    // Navigate to verification page with email
    onNavigate('verification', formData.email);
  };

  return (
    <div className="h-screen grid grid-cols-1 lg:grid-cols-2 bg-gradient-to-br from-wellora-light via-white to-wellora-soft dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 transition-colors duration-500">
      {/* Left section for the image - visible on large screens */}
      <div className="relative hidden lg:flex items-center justify-center p-6 bg-gradient-to-br from-wellora/90 to-wellora-dark dark:from-gray-700 dark:to-gray-900">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-70"
          style={{ backgroundImage: 'url("https://via.placeholder.com/1200x800?text=Health+Image")' }} // Placeholder image
        ></div>
        <div className="relative z-10 text-white text-center">
          <h1 className="text-5xl font-extrabold mb-4 leading-tight">Join Us <br /> For a Healthier You</h1>
          <p className="text-xl font-medium">Personalized plans, expert guidance, and a supportive community.</p>
        </div>
      </div>

      {/* Right section for the register form */}
      <div className="relative flex items-center justify-center p-6 w-full">
        {/* The existing background pattern is now applied only to the form wrapper */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMwMDAiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDE2YzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptLTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTE2IDBjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OS00IDQgNCA0LTEuNzkgNC00em0tOCA4Yz Pedro-Mi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptLTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTE2IDBjMC0yLjIxLTEuNzktNC00LTRsLTQgMS43OS00IDQgMS43OS00IDQgNCA0LTEuNzkgNC00em0tMTYgOGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-40 dark:opacity-20 z-0"></div>

        {/* Existing absolute elements for back button and theme toggle */}
        <div className="absolute top-6 left-6 z-30">
          <button
            onClick={() => step === 'userType' ? onNavigate('home') : setStep('userType')}
            className="flex items-center space-x-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">{step === 'userType' ? 'Back to Home' : 'Back'}</span>
          </button>
        </div>

        <div className="absolute top-6 right-6 z-30">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-md relative z-10">
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
                {step === 'userType' ? 'Select your account type' : 'Start your journey to better nutrition'}
              </p>
            </div>

            {step === 'userType' ? (
              <div className="space-y-4">
                <button
                  onClick={() => setUserType('general')}
                  className={`w-full p-6 rounded-2xl border-2 transition-all duration-300 flex items-center space-x-4 ${
                    userType === 'general'
                      ? 'border-wellora bg-wellora-light dark:bg-wellora/10'
                      : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/30 hover:border-wellora/40'
                  }`}
                >
                  <div className={`p-3 rounded-xl ${userType === 'general' ? 'bg-wellora' : 'bg-gray-400'}`}>
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-gray-800 dark:text-white">General User</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Find nutrition and health tips</p>
                  </div>
                </button>

                <button
                  onClick={() => setUserType('partner')}
                  className={`w-full p-6 rounded-2xl border-2 transition-all duration-300 flex items-center space-x-4 ${
                    userType === 'partner'
                      ? 'border-wellora-dark bg-wellora-soft dark:bg-wellora/10'
                      : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/30 hover:border-wellora/40'
                  }`}
                >
                  <div className={`p-3 rounded-xl ${userType === 'partner' ? 'bg-wellora-dark' : 'bg-gray-400'}`}>
                    <Building2 className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-gray-800 dark:text-white">Partner</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Gym / Hospital / Clinic</p>
                  </div>
                </button>

                <button
                  onClick={() => setUserType('vendor')}
                  className={`w-full p-6 rounded-2xl border-2 transition-all duration-300 flex items-center space-x-4 ${
                    userType === 'vendor'
                      ? 'border-wellora bg-wellora-surface dark:bg-wellora/10'
                      : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/30 hover:border-wellora/40'
                  }`}
                >
                  <div className={`p-3 rounded-xl ${userType === 'vendor' ? 'bg-wellora' : 'bg-gray-400'}`}>
                    <ShoppingBag className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-gray-800 dark:text-white">Vendor</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Sell health products</p>
                  </div>
                </button>

                <button
                  onClick={handleContinueFromUserType}
                  disabled={!userType}
                  className={`w-full py-4 rounded-xl font-semibold transition-all duration-300 mt-6 ${
                    userType
                      ? 'bg-wellora text-white hover:bg-wellora-hover shadow-lg hover:shadow-xl transform hover:scale-[1.02]'
                      : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                  }`}
                >
                  Continue
                </button>

                <div className="mt-6 text-center">
                  <p className="text-gray-600 dark:text-gray-400">
                    Already have an account?{' '}
                    <button
                      onClick={() => onNavigate('login')}
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
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="John Doe"
                    className="w-full pl-12 pr-4 py-3.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-wellora focus:border-transparent outline-none transition-all text-gray-800 dark:text-white placeholder-gray-400"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+1 (555) 000-0000"
                    className="w-full pl-12 pr-4 py-3.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-wellora focus:border-transparent outline-none transition-all text-gray-800 dark:text-white placeholder-gray-400"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="your@email.com"
                    className="w-full pl-12 pr-4 py-3.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-wellora focus:border-transparent outline-none transition-all text-gray-800 dark:text-white placeholder-gray-400"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Create a password"
                    className="w-full pl-12 pr-12 py-3.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-wellora focus:border-transparent outline-none transition-all text-gray-800 dark:text-white placeholder-gray-400"
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
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    placeholder="Confirm your password"
                    className="w-full pl-12 pr-12 py-3.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-wellora focus:border-transparent outline-none transition-all text-gray-800 dark:text-white placeholder-gray-400"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-start space-x-2 text-sm">
                <input
                  type="checkbox"
                  className="w-4 h-4 mt-0.5 rounded border-gray-300 text-wellora focus:ring-wellora"
                  required
                />
                <label className="text-gray-600 dark:text-gray-400">
                  I agree to the{' '}
                  <button type="button" className="text-wellora dark:text-wellora hover:text-wellora-dark font-medium">
                    Terms of Service
                  </button>{' '}
                  and{' '}
                  <button type="button" className="text-wellora dark:text-wellora hover:text-wellora-dark font-medium">
                    Privacy Policy
                  </button>
                </label>
              </div>

              <button
                type="submit"
                className="w-full py-4 bg-wellora text-white hover:bg-wellora-hover rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-300"
              >
                Register
              </button>

              <div className="mt-6 text-center">
                <p className="text-gray-600 dark:text-gray-400">
                  Already have an account?{' '}
                  <button
                    onClick={() => onNavigate('login')}
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
