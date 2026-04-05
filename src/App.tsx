import { useState } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { VerificationPage } from './pages/VerificationPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { PendingApprovalPage } from './pages/PendingApprovalPage';
import { UserDashboardPage } from './pages/UserDashboardPage';
import { MenuOrderPage } from './pages/MenuOrderPage';
import { MealRecommendationsPage } from './pages/MealRecommendationsPage';
import { WellnessPage } from './pages/WellnessPage';
import { SettingsPage } from './pages/SettingsPage';
import { VendorDashboardPage } from './pages/VendorDashboardPage';
import { PartnerDashboardPage } from './pages/PartnerDashboardPage';
import type { AppPage } from './types/page';

type Page = AppPage;

type Role = 'user' | 'vendor' | 'partner';

const validPages: Page[] = [
  'home',
  'login',
  'register',
  'verification',
  'onboarding-user',
  'onboarding-vendor',
  'onboarding-partner',
  'pending-approval',
  'user-dashboard',
  'user-menu-order',
  'user-meal-recommendations',
  'user-wellness',
  'user-settings',
  'vendor-dashboard',
  'partner-dashboard',
];

function App() {
  const [currentPage, setCurrentPage] = useState<Page>(() => {
    const savedPage = localStorage.getItem('current-page') as Page | null;
    return savedPage && validPages.includes(savedPage) ? savedPage : 'home';
  });
  const [verificationEmail, setVerificationEmail] = useState<string>('user@email.com');

  const persistNavigation = (page: Page, role: Role | null = null) => {
    setCurrentPage(page);
    localStorage.setItem('current-page', page);

    if (role) {
      localStorage.setItem('current-role', role);
    } else if (page === 'home' || page === 'login' || page === 'register') {
      localStorage.removeItem('current-role');
    }
  };

  const handleNavigate = (page: Page, email?: string) => {
    if (email) {
      setVerificationEmail(email);
    }
    persistNavigation(page);
  };

  const getOnboardingComplete = (role: Role) => {
    return localStorage.getItem(`${role}-onboarding-complete`) === 'true';
  };

  const handleLoginSuccess = (role: Role) => {
    const completed = getOnboardingComplete(role);

    if (!completed) {
      persistNavigation(`onboarding-${role}` as Page, role);
      return;
    }

    if (role === 'user') {
      persistNavigation('user-dashboard', role);
      return;
    }

    if (role === 'vendor') {
      persistNavigation('vendor-dashboard', role);
      return;
    }

    persistNavigation('partner-dashboard', role);
  };

  return (
    <ThemeProvider>
      <div className="transition-colors duration-500">
        {currentPage === 'home' && <HomePage onNavigate={setCurrentPage} />}
        {currentPage === 'login' && <LoginPage onNavigate={setCurrentPage} onLoginSuccess={handleLoginSuccess} />}
        {currentPage === 'register' && <RegisterPage onNavigate={handleNavigate} />}
        {currentPage === 'verification' && <VerificationPage email={verificationEmail} onNavigate={setCurrentPage} />}
        {currentPage === 'onboarding-user' && <OnboardingPage role="user" onNavigate={handleNavigate} />}
        {currentPage === 'onboarding-vendor' && <OnboardingPage role="vendor" onNavigate={handleNavigate} />}
        {currentPage === 'onboarding-partner' && <OnboardingPage role="partner" onNavigate={handleNavigate} />}
        {currentPage === 'pending-approval' && <PendingApprovalPage onNavigate={handleNavigate} />}
        {currentPage === 'user-dashboard' && <UserDashboardPage onNavigate={setCurrentPage} />}
        {currentPage === 'user-menu-order' && <MenuOrderPage onNavigate={setCurrentPage} />}
        {currentPage === 'user-meal-recommendations' && <MealRecommendationsPage onNavigate={setCurrentPage} />}
        {currentPage === 'user-wellness' && <WellnessPage onNavigate={setCurrentPage} />}
        {currentPage === 'user-settings' && <SettingsPage onNavigate={setCurrentPage} />}
        {currentPage === 'vendor-dashboard' && <VendorDashboardPage onNavigate={setCurrentPage} />}
        {currentPage === 'partner-dashboard' && <PartnerDashboardPage onNavigate={setCurrentPage} />}
      </div>
    </ThemeProvider>
  );
}

export default App;
