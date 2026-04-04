import { Outlet, NavLink, useNavigate } from "react-router-dom";
import useFlowStore from "../store/flowStore";

export default function AppLayout() {
  const theme = useFlowStore((s) => s.theme);
  const toggleTheme = useFlowStore((s) => s.toggleTheme);
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <nav className="app-sidebar">
        <div className="sidebar-brand" onClick={() => navigate("/")}>
          Polygents
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Workflows</div>
          <NavLink to="/" end className={({ isActive }) => `sidebar-nav-item ${isActive ? "active" : ""}`}>
            <span className="sidebar-icon">📋</span>
            <span>Workflow List</span>
          </NavLink>
          <NavLink to="/workflows/new" className={({ isActive }) => `sidebar-nav-item ${isActive ? "active" : ""}`}>
            <span className="sidebar-icon">➕</span>
            <span>New Workflow</span>
          </NavLink>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Teams</div>
          <NavLink to="/teams" className={({ isActive }) => `sidebar-nav-item ${isActive ? "active" : ""}`}>
            <span className="sidebar-icon">👥</span>
            <span>Team Templates</span>
          </NavLink>
          <NavLink to="/create?mode=chat" className={({ isActive }) => `sidebar-nav-item ${isActive ? "active" : ""}`}>
            <span className="sidebar-icon">💬</span>
            <span>Chat Create</span>
          </NavLink>
          <NavLink to="/skills" className={({ isActive }) => `sidebar-nav-item ${isActive ? "active" : ""}`}>
            <span className="sidebar-icon">🧩</span>
            <span>Skills</span>
          </NavLink>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Records</div>
          <NavLink to="/history" className={({ isActive }) => `sidebar-nav-item ${isActive ? "active" : ""}`}>
            <span className="sidebar-icon">🕐</span>
            <span>Run History</span>
          </NavLink>
          <NavLink to="/logs" className={({ isActive }) => `sidebar-nav-item ${isActive ? "active" : ""}`}>
            <span className="sidebar-icon">📝</span>
            <span>Comm Logs</span>
          </NavLink>
        </div>

        <div className="sidebar-bottom">
          <button className="sidebar-theme-btn" onClick={toggleTheme}>
            {theme === "dark" ? "☀ Light" : "🌙 Dark"}
          </button>
        </div>
      </nav>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
