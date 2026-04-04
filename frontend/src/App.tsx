import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import WorkflowListPage from "./pages/WorkflowListPage";
import WorkflowEditPage from "./pages/WorkflowEditPage";
import TeamsPage from "./pages/TeamsPage";
import CreatePage from "./pages/CreatePage";
import CanvasPage from "./pages/CanvasPage";
import AgentDetailPage from "./pages/AgentDetailPage";
import LogsPage from "./pages/LogsPage";
import HistoryPage from "./pages/HistoryPage";
import SkillsPage from "./pages/SkillsPage";
import ToastContainer from "./components/Toast";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<WorkflowListPage />} />
          <Route path="/workflows/new" element={<WorkflowEditPage />} />
          <Route path="/workflows/:id/edit" element={<WorkflowEditPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/create" element={<CreatePage />} />
          <Route path="/agent/:id" element={<AgentDetailPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/canvas" element={<CanvasPage />} />
        </Route>
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  );
}
