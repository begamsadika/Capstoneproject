import { useState } from "react";
import { AdminDashboard } from "./AdminDashboard";
import type { AdminPage } from "./layout/AdminLayout";
import { ManageUsers } from "./pages/ManageUsers";
import { ManageVendor } from "./pages/ManageVendor";

function App() {
  const [currentPage, setCurrentPage] = useState<AdminPage>("manage-vendors");

  if (currentPage === "manage-users") {
    return <ManageUsers onNavigate={setCurrentPage} />;
  }

  if (currentPage === "manage-vendors") {
    return <ManageVendor onNavigate={setCurrentPage} />;
  }

  return <AdminDashboard onNavigate={setCurrentPage} />;
}

export default App;
