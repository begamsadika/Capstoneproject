import { useState } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';

type Page = 'home' | 'login' | 'register';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');

  return (
    <ThemeProvider>
      <div className="transition-colors duration-500">
        {currentPage === 'home' && <HomePage onNavigate={setCurrentPage} />}
        {currentPage === 'login' && <LoginPage onNavigate={setCurrentPage} />}
        {currentPage === 'register' && <RegisterPage onNavigate={setCurrentPage} />}
      </div>
    </ThemeProvider>
  );
}

export default App;
