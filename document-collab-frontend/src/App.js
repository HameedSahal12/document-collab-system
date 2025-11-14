import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './Navbar';
import DocumentDashboard from './DocumentDashboard';
import DocumentEditor from './DocumentEditor';
import Login from './Login';
import Signup from './Signup';
import Analytics from './Analytics';
import RecentDashboard from './RecentDashboard';
import Settings from './Settings';
import axios from 'axios';

axios.defaults.baseURL = 'http://localhost:5050';
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function App() {
  const [isLoggedIn, setIsLoggedIn] = React.useState(!!localStorage.getItem('token'));
  const [showSignup, setShowSignup] = React.useState(false);
  const [theme, setTheme] = React.useState(() => {
    const stored = localStorage.getItem('theme');
    return stored === 'dark' ? 'dark' : 'light';
  });

  React.useEffect(() => {
    localStorage.setItem('theme', theme);
    document.body.classList.remove('light-theme', 'dark-theme');
    document.body.classList.add(`${theme}-theme`);
  }, [theme]);

  const toggleTheme = React.useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsLoggedIn(false);
  };

  if (!isLoggedIn) {
    return showSignup
      ? <Signup onSignupSuccess={() => setShowSignup(false)} switchToLogin={() => setShowSignup(false)} />
      : <Login onLoginSuccess={() => setIsLoggedIn(true)} switchToSignup={() => setShowSignup(true)} />;
  }

  return (
    <div className="app-wrapper">
      <Navbar onLogout={handleLogout} />
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" />} />
        <Route path="/dashboard" element={<RecentDashboard />} />
        <Route path="/documents" element={<DocumentDashboard />} />
        <Route path="/editor/:docId" element={<DocumentEditor />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<Settings theme={theme} onToggleTheme={toggleTheme} />} />
      </Routes>
    </div>
  );
}

export default App;
