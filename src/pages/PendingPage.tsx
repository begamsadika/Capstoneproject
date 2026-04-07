import { useEffect, useState } from 'react';
import { RefreshCw, ArrowLeft } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import { AppPage } from '../types/page';
import { getVendorStatus, VendorStatus } from '../api/vendor';

interface PendingPageProps {
  onNavigate: (page: AppPage) => void;
}

export function PendingPage({ onNavigate }: PendingPageProps) {
  const [status, setStatus] = useState<VendorStatus>('PENDING');
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = async () => {
    setIsChecking(true);
    setError(null);
    try {
      const nextStatus = await getVendorStatus();
      setStatus(nextStatus);
      if (nextStatus === 'APPROVED') {
        onNavigate('vendor-dashboard');
      }
    } catch (err) {
      setError('Unable to check status right now.');
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    refreshStatus();
    const interval = window.setInterval(refreshStatus, 10000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-wellora-light via-white to-wellora-soft dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 transition-colors duration-500 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMwMDAiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDE2YzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptLTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTE2IDBjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OS00IDQgNCA0LTEuNzkgNC00em0tOCA4YzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptLTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTE2IDBjMC0yLjIxLTEuNzktNC00LTRsLTQgMS43OS00IDQgMS43OS00IDQgNCA0LTEuNzkgNC00em0tMTYgOGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6Ii8+PC9nPjwvZz4=')] opacity-40 dark:opacity-20"></div>

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
        <div className="absolute inset-0 bg-wellora/30 rounded-3xl blur-2xl opacity-30"></div>
        <div className="relative bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/20 dark:border-gray-700/50">
          <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-4 text-center">
            Your account is under review
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6 text-center">
            We’re checking your vendor onboarding information. This page will refresh automatically every 10 seconds.
          </p>
          <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 p-5 mb-6 bg-gray-50 dark:bg-gray-900/50">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Current Status</p>
            <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">{status}</p>
            {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
          </div>
          <button
            type="button"
            onClick={refreshStatus}
            disabled={isChecking}
            className="w-full inline-flex items-center justify-center gap-2 py-3 bg-wellora text-white rounded-xl font-semibold shadow-lg hover:bg-wellora-hover transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className="w-4 h-4" />
            {isChecking ? 'Checking status…' : 'Refresh status'}
          </button>
        </div>
      </div>
    </div>
  );
}
