import { useState } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { VerificationPage } from './pages/VerificationPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { PendingApprovalPage } from './pages/PendingApprovalPage';

type Page = 'home' | 'login' | 'register' | 'verification' | 'onboarding-user' | 'onboarding-vendor' | 'onboarding-partner' | 'pending-approval' | 'user-dashboard' | 'vendor-dashboard' | 'partner-dashboard';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [verificationEmail, setVerificationEmail] = useState<string>('user@email.com');

  const handleNavigate = (page: Page, email?: string) => {
    if (email) {
      setVerificationEmail(email);
    }
    setCurrentPage(page);
  };

  const handleLoginSuccess = (role: 'user' | 'vendor' | 'partner') => {
    // Reset onboarding for fresh login
    localStorage.removeItem(`${role}-onboarding-complete`);
    localStorage.removeItem(`${role}-admin-approved`);
    
    // Always go to onboarding page first
    setCurrentPage(`onboarding-${role}` as Page);
  };

  return (
    <ThemeProvider>
      <div className="transition-colors duration-500">
        {currentPage === 'home' && <HomePage onNavigate={setCurrentPage} />}
        {currentPage === 'login' && <LoginPage onNavigate={setCurrentPage} onLoginSuccess={handleLoginSuccess} />}
        {currentPage === 'register' && <RegisterPage onNavigate={handleNavigate} />}
        {currentPage === 'verification' && <VerificationPage email={verificationEmail} onNavigate={setCurrentPage} />}
        {currentPage === 'onboarding-user' && <OnboardingPage role="user" onNavigate={setCurrentPage} />}
        {currentPage === 'onboarding-vendor' && <OnboardingPage role="vendor" onNavigate={setCurrentPage} />}
        {currentPage === 'onboarding-partner' && <OnboardingPage role="partner" onNavigate={setCurrentPage} />}
        {currentPage === 'pending-approval' && <PendingApprovalPage onNavigate={setCurrentPage} />}
        {currentPage === 'user-dashboard' && <div>User Dashboard (Placeholder)</div>}
        {currentPage === 'vendor-dashboard' && <div>Vendor Dashboard (Placeholder)</div>}
        {currentPage === 'partner-dashboard' && <div>Partner Dashboard (Placeholder)</div>}
      </div>
    </ThemeProvider>
  );
}

export default App;
