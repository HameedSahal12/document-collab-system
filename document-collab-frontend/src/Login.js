import React, { useState } from 'react';
import axios from 'axios';
import './Auth.css';
import logo from './logo.svg';
import { FaEnvelope, FaUser, FaLock } from 'react-icons/fa';

export default function Login({ onLoginSuccess, switchToSignup }) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await axios.post('http://localhost:5050/login', { email, username, password });

      // âœ… Save both tokens and basic user info
      localStorage.setItem('token', response.data.access_token);
      localStorage.setItem('refresh_token', response.data.refresh_token);
      localStorage.setItem('username', username);
      localStorage.setItem('email', email);

      setLoading(false);
      onLoginSuccess();
    } catch (err) {
      setLoading(false);
      setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
    }
  };

  return (
    <div className="auth-bg">
      <div className="auth-card">
        <div className="auth-header">
          <img
            src={logo}
            alt="Synapse Logo"
            style={{
              height: '80px',
              marginBottom: '0.8em',
              filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.4))',
            }}
          />
        </div>

        <h2 className="auth-title">Welcome Back</h2>
        <p className="auth-subtitle">Sign in to continue collaborating</p>

        <form onSubmit={handleLogin} className="auth-form">
          <div className="input-with-icon">
            <FaEnvelope className="input-icon" />
            <input
              type="email"
              placeholder="Team Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="input-with-icon">
            <FaUser className="input-icon" />
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="input-with-icon">
            <FaLock className="input-icon" />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Logging In...' : 'Log In'}
          </button>

          {error && <div className="error">{error}</div>}
        </form>

        <p className="auth-footer">
          Don't have an account?{' '}
          <span className="auth-switch-link" onClick={switchToSignup}>
            Sign Up
          </span>
        </p>
      </div>
    </div>
  );
}
