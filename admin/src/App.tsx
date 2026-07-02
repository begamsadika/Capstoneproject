import { useState } from "react";
import { AdminDashboard } from "./AdminDashboard";
import type { AdminPage } from "./layout/AdminLayout";
import { ManageUsers } from "./pages/ManageUsers";
import { ManageVendor } from "./pages/ManageVendor";
import { AdminLogin } from "./pages/AdminLogin";
import { getStoredAdminUser, adminLogout } from "./api/admin";

function App() {
  const [user, setUser] = useState(() => getStoredAdminUser());
  const [currentPage, setCurrentPage] = useState<AdminPage>("dashboard");

  const handleLoginSuccess = () => {
    setUser(getStoredAdminUser());
    setCurrentPage("dashboard");
  };

  const handleLogout = () => {
    adminLogout();
    setUser(null);
  };

  if (!user) {
    return <AdminLogin onLoginSuccess={handleLoginSuccess} />;
  }

  if (currentPage === "manage-users") {
    return <ManageUsers onNavigate={setCurrentPage} onLogout={handleLogout} />;
  }

  if (currentPage === "manage-vendors") {
    return <ManageVendor onNavigate={setCurrentPage} onLogout={handleLogout} />;
  }

  return <AdminDashboard onNavigate={setCurrentPage} onLogout={handleLogout} />;
}

export default App;
