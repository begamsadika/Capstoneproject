import { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import { WelloraLogoMark } from '../components/WelloraLogoMark';
import { loginVendor, VendorStatus } from '../api/vendor';

interface LoginPageProps {
  onNavigate: (page: 'home' | 'register') => void;
  onLoginSuccess: (role: 'user' | 'vendor' | 'partner', status?: VendorStatus) => void;
}

export function LoginPage({ onNavigate, onLoginSuccess }: LoginPageProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'vendor' | 'partner'>('user'); // Default role

  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      if (role === 'vendor') {
        const user = await loginVendor(email, password);
        onLoginSuccess(role, user.status);
      } else {
        onLoginSuccess(role);
      }
    } finally {
      setIsLoggingIn(false);
    }
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
          <h1 className="text-5xl font-extrabold mb-4 leading-tight">Start Your <br /> Healthy Journey</h1>
          <p className="text-xl font-medium">Personalized plans, expert guidance, and a supportive community.</p>
        </div>
      </div>

      {/* Right section for the login form */}
      <div className="relative flex items-center justify-center p-6 w-full">
        {/* The existing background pattern is now applied only to the form wrapper */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMwMDAiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDE2YzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptLTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTE2IDBjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OS00IDQgNCA0LTEuNzkgNC00em0tOCA4Yz Pedro-Mi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptLTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTE2IDBjMC0yLjIxLTEuNzktNC00LTRsLTQgMS43OS00IDQgMS43OS00IDQgNCA0LTEuNzkgNC00em0tMTYgOGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-40 dark:opacity-20 z-0"></div>
        
        {/* Existing absolute elements for back button and theme toggle */}
        <div className="absolute top-6 left-6 z-30">
          <button
            onClick={() => onNavigate('home')}
            className="flex items-center space-x-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Back to Home</span>
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
                Welcome Back
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Sign in to continue your healthy journey
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Select Role
                </label>
                <div className="flex space-x-4">
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      className="form-radio"
                      name="role"
                      value="user"
                      checked={role === 'user'}
                      onChange={() => setRole('user')}
                    />
                    <span className="ml-2 text-gray-700 dark:text-gray-300">User</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      className="form-radio"
                      name="role"
                      value="vendor"
                      checked={role === 'vendor'}
                      onChange={() => setRole('vendor')}
                    />
                    <span className="ml-2 text-gray-700 dark:text-gray-300">Vendor</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      className="form-radio"
                      name="role"
                      value="partner"
                      checked={role === 'partner'}
                      onChange={() => setRole('partner')}
                    />
                    <span className="ml-2 text-gray-700 dark:text-gray-300">Partner</span>
                  </label>
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
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
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

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-300 text-wellora focus:ring-wellora"
                  />
                  <span className="text-gray-600 dark:text-gray-400">Remember me</span>
                </label>
                <button
                  type="button"
                  className="text-wellora dark:text-wellora hover:text-wellora-dark dark:hover:text-wellora font-medium transition-colors"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-4 bg-wellora text-white hover:bg-wellora-hover rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoggingIn ? 'Signing in...' : 'Continue'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-gray-600 dark:text-gray-400">
                Don't have an account?{' '}
                <button
                  onClick={() => onNavigate('register')}
                  className="text-wellora dark:text-wellora hover:text-wellora-dark font-semibold transition-colors"
                >
                  Create Account
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
