import { NavLink, Route, Routes } from "react-router-dom";
import WorkflowListPage from "./pages/WorkflowListPage";
import WorkflowEditPage from "./pages/WorkflowEditPage";
import RunDetailPage from "./pages/RunDetailPage";
import RunsListPage from "./pages/RunsListPage";
import RunComparePage from "./pages/RunComparePage";
import SettingsPage from "./pages/SettingsPage";

interface NavItem {
  to: string;
  label: string;
}

const NAV: NavItem[] = [
  { to: "/", label: "Workflows" },
  { to: "/runs", label: "Runs" },
  { to: "/settings", label: "Settings" },
];

export default function App() {
  return (
    <div className="app">
      <nav className="topnav">
        <div className="topnav-brand">
          <span className="topnav-brand-mark" aria-hidden />
          <span className="topnav-brand-name">Polygents</span>
          <span className="topnav-brand-sub">worker · critic</span>
        </div>
        <ul className="topnav-tabs">
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `topnav-link${isActive ? " active" : ""}`
                }
              >
                <span className="topnav-link-dot" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="content">
        <Routes>
          <Route path="/" element={<WorkflowListPage />} />
          <Route path="/workflows/new" element={<WorkflowEditPage mode="new" />} />
          <Route path="/workflows/:id" element={<WorkflowEditPage mode="edit" />} />
          <Route path="/runs" element={<RunsListPage />} />
          <Route path="/runs/compare" element={<RunComparePage />} />
          <Route path="/runs/:id" element={<RunDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
