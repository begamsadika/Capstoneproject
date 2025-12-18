import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';

interface PendingApprovalPageProps {
  onNavigate: (page: string) => void;
}

export function PendingApprovalPage({ onNavigate }: PendingApprovalPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 transition-colors duration-500 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMwMDAiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDE2YzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptLTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTE2IDBjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OSA0IDQgNCA0LTEuNzkgNC00em0tOCA4YzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptLTggMGMwLTIuMjEtMS435LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptMTYgMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bS0xNiA4YzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptOCA0YzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptOCA0YzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHoiLz48L2cPjwvZz48L3N2Zz4=')] opacity-40 dark:opacity-20"></div>

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
        <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-3xl blur-2xl opacity-20"></div>
        <div className="relative bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/20 dark:border-gray-700/50">
          <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-2 text-center">
            Account Pending Approval
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8 text-center">
            Your account is currently under review by our administrators.
            You will be notified once it has been approved.
          </p>
          <button
            onClick={() => onNavigate('home')}
            className="w-full py-3 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-300"
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
