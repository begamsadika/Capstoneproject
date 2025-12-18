import { useState } from 'react';
import { CheckCircle, Mail, RotateCw } from 'lucide-react';

type Page = 'home' | 'login' | 'register' | 'verification';

interface VerificationPageProps {
  email?: string;
  onNavigate: (page: Page) => void;
}

export function VerificationPage({ email = 'user@email.com', onNavigate }: VerificationPageProps) {
  const [verificationSent, setVerificationSent] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const handleSendVerification = () => {
    setIsResending(true);
    // Simulate sending verification email
    setTimeout(() => {
      setVerificationSent(true);
      setIsResending(false);
      console.log(`Verification link sent to ${email}`);
    }, 1500);
  };

  const handleResend = () => {
    setVerificationSent(false);
    handleSendVerification();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        {/* Success Icon */}
        <div className="flex justify-center mb-6">
          <div className="bg-green-100 p-4 rounded-full">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
        </div>

        {/* Heading */}
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">Account Created!</h2>
        <p className="text-center text-gray-600 mb-6">
          We've created your account. Now let's verify your email.
        </p>

        {/* Email Display */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6 flex items-center space-x-3">
          <Mail className="w-5 h-5 text-gray-400" />
          <div>
            <p className="text-sm text-gray-600">Verification email will be sent to:</p>
            <p className="font-semibold text-gray-800">{email}</p>
          </div>
        </div>

        {/* Verification Status */}
        {verificationSent && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-green-800 font-medium">
              ✓ Verification link sent successfully! Check your email.
            </p>
          </div>
        )}

        {/* Send Verification Button */}
        <button
          onClick={handleSendVerification}
          disabled={isResending || verificationSent}
          className={`w-full py-3 rounded-lg font-semibold flex items-center justify-center space-x-2 transition-all mb-3 ${
            verificationSent
              ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
              : isResending
              ? 'bg-blue-400 text-white'
              : 'bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white'
          }`}
        >
          {isResending && <RotateCw className="w-5 h-5 animate-spin" />}
          <span>{isResending ? 'Sending...' : verificationSent ? 'Link Sent' : 'Send Verification Link'}</span>
        </button>

        {/* Resend Link */}
        {verificationSent && (
          <button
            onClick={handleResend}
            className="w-full py-2 text-blue-600 font-medium hover:text-blue-700 transition-colors"
          >
            Resend verification link
          </button>
        )}

        {/* Go to Login Button */}
        <button
          onClick={() => onNavigate('login')}
          className="w-full py-3 bg-white border-2 border-gray-300 text-gray-800 rounded-lg font-semibold hover:bg-gray-50 transition-all mt-4"
        >
          Go to Login
        </button>

        {/* Help Text */}
        <p className="text-center text-sm text-gray-500 mt-6">
          Didn't receive the email? Check your spam folder or click "Resend verification link"
        </p>
      </div>
    </div>
  );
}

export default VerificationPage;
