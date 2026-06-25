import {
  BarChart3,
  Bot,
  CheckCircle2,
  CalendarDays,
  ClipboardCheck,
  Gauge,
  HelpCircle,
  History,
  Layers,
  LogOut,
  MessageSquare,
  Settings,
  Shield,
  Sparkles,
  Lightbulb,
  Trophy,
  Users,
  Wand2
} from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { canManage, canSuper } from '../lib/api.js';

const navItems = [
  { to: '/', label: 'Dashboard', icon: Gauge, roles: ['super_admin', 'admin', 'user'] },
  { to: '/employees', label: 'Employees', icon: Users, roles: ['super_admin', 'admin'] },
  { to: '/advanced-events', label: 'Advanced Events', icon: Layers, roles: ['super_admin', 'admin', 'user'] },
  { to: '/approvals', label: 'Approval Center', icon: CheckCircle2, roles: ['super_admin', 'admin'] },
  { to: '/speaker-prep', label: 'Speaker Prep', icon: ClipboardCheck, roles: ['super_admin', 'admin', 'user'] },
  { to: '/topic-bank', label: 'Topic Bank', icon: Lightbulb, roles: ['super_admin', 'admin', 'user'] },
  { to: '/ai-assistant', label: 'AI Assistant', icon: Bot, roles: ['super_admin', 'admin'] },
  { to: '/quizzes', label: 'Quiz Studio', icon: HelpCircle, roles: ['super_admin', 'admin', 'user'] },
  { to: '/feedback', label: 'Feedback Center', icon: MessageSquare, roles: ['super_admin', 'admin'] },
  { to: '/gamification', label: 'Gamification', icon: Trophy, roles: ['super_admin', 'admin', 'user'] },
  { to: '/speaker-wheel', label: 'Speaker Wheel', icon: Sparkles, roles: ['super_admin', 'admin'] },
  { to: '/upcoming-speakers', label: 'Upcoming Speakers', icon: CalendarDays, roles: ['super_admin', 'admin', 'user'] },
  { to: '/coordinator-wheel', label: 'Coordinator Wheel', icon: Trophy, roles: ['super_admin', 'admin'] },
  { to: '/custom-wheels', label: 'Custom Wheels', icon: Wand2, roles: ['super_admin', 'admin'] },
  { to: '/schedule', label: 'Schedule', icon: CalendarDays, roles: ['super_admin', 'admin', 'user'] },
  { to: '/history', label: 'History', icon: History, roles: ['super_admin', 'admin', 'user'] },
  { to: '/reports', label: 'Reports', icon: BarChart3, roles: ['super_admin', 'admin'] },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ['super_admin'] },
  { to: '/users', label: 'User Management', icon: Shield, roles: ['super_admin'] }
];

export default function Layout() {
  const { user, logout } = useAuth();
  const roleText = user?.role?.replace('_', ' ');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">OA</div>
          <div>
            <strong>ORATION ARENA</strong>
            <span>{roleText}</span>
          </div>
        </div>
        <nav>
          {navItems
            .filter((item) => item.roles.includes(user.role))
            .map((item) => {
              const Icon = item.icon;
              return (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
                  <Icon size={18} />
                  {item.label}
                </NavLink>
              );
            })}
        </nav>
        <div className="sidebar-footer">
          <div>
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          <button className="icon-btn" title="Log out" onClick={logout}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet context={{ canManage: canManage(user.role), canSuper: canSuper(user.role) }} />
      </main>
    </div>
  );
}
