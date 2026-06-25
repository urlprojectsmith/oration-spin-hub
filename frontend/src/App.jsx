import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import ApprovalCenter from './pages/ApprovalCenter.jsx';
import AdvancedEvents from './pages/AdvancedEvents.jsx';
import AIAssistant from './pages/AIAssistant.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Employees from './pages/Employees.jsx';
import FeedbackCenter from './pages/FeedbackCenter.jsx';
import Gamification from './pages/Gamification.jsx';
import History from './pages/History.jsx';
import Login from './pages/Login.jsx';
import QuizStudio from './pages/QuizStudio.jsx';
import Reports from './pages/Reports.jsx';
import Schedule from './pages/Schedule.jsx';
import Settings from './pages/Settings.jsx';
import Setup from './pages/Setup.jsx';
import Spin from './pages/Spin.jsx';
import SpeakerPrep from './pages/SpeakerPrep.jsx';
import TopicBank from './pages/TopicBank.jsx';
import UpcomingSpeakers from './pages/UpcomingSpeakers.jsx';
import Users from './pages/Users.jsx';
import Wheels from './pages/Wheels.jsx';
import { api } from './lib/api.js';
import { useEffect, useState } from 'react';

function Protected({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();
  const [setupStatus, setSetupStatus] = useState({ loading: true, needsSetup: false });

  async function loadSetupStatus() {
    try {
      const status = await api('/setup/status');
      setSetupStatus({ loading: false, needsSetup: status.needsSetup });
    } catch {
      setSetupStatus({ loading: false, needsSetup: false });
    }
  }

  useEffect(() => {
    loadSetupStatus();
  }, []);

  if (setupStatus.loading) return <div className="loading">Checking setup...</div>;

  if (setupStatus.needsSetup) {
    return (
      <Routes>
        <Route path="*" element={<Setup onReady={loadSetupStatus} />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="employees" element={<Employees />} />
        <Route path="advanced-events" element={<AdvancedEvents />} />
        <Route path="approvals" element={<ApprovalCenter />} />
        <Route path="speaker-prep" element={<SpeakerPrep />} />
        <Route path="topic-bank" element={<TopicBank />} />
        <Route path="ai-assistant" element={<AIAssistant />} />
        <Route path="quizzes" element={<QuizStudio />} />
        <Route path="feedback" element={<FeedbackCenter />} />
        <Route path="gamification" element={<Gamification />} />
        <Route path="speaker-wheel" element={<Spin type="speaker" />} />
        <Route path="upcoming-speakers" element={<UpcomingSpeakers />} />
        <Route path="coordinator-wheel" element={<Spin type="coordinator" />} />
        <Route path="custom-wheels" element={<Wheels />} />
        <Route path="custom-wheels/:wheelId/spin" element={<Spin type="custom" />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="history" element={<History />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
        <Route path="users" element={<Users />} />
      </Route>
    </Routes>
  );
}
