import React, { useState } from 'react';
import axios from 'axios';
import './Auth.css';
import logo from './logo.svg';
import { FaEnvelope, FaLock, FaUserPlus } from 'react-icons/fa';

export default function Signup({ switchToLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [usernames, setUsernames] = useState(['']);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Add new teammate field
  const addUsernameField = () => setUsernames([...usernames, '']);

  // Update username in a specific index
  const handleUsernameChange = (index, value) => {
    const updated = [...usernames];
    updated[index] = value;
    setUsernames(updated);
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('email', email);
      formData.append('password', password);
      usernames.forEach(u => formData.append('usernames[]', u));

      const response = await axios.post('http://localhost:5050/signup', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setLoading(false);
      setMessage(response.data.message || 'Signup successful! You can now log in.');
      setEmail('');
      setPassword('');
      setUsernames(['']);
      // no file field anymore
    } catch (err) {
      setLoading(false);
      setError(err.response?.data?.error || 'Signup failed. Please try again.');
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

        <h2 className="auth-title">Create Your Team Workspace</h2>
        <p className="auth-subtitle">Collaborate with your teammates in real-time</p>

        <form onSubmit={handleSignup} className="auth-form">
          <div className="input-with-icon">
            <FaEnvelope className="input-icon" />
            <input
              type="email"
              placeholder="Team Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="input-with-icon">
            <FaLock className="input-icon" />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="team-section">
            <label style={{ color: '#fff', fontWeight: 500 }}>Team Members</label>
            {usernames.map((u, i) => (
              <div className="input-with-icon" key={i}>
                <FaUserPlus className="input-icon" />
                <input
                  type="text"
                  placeholder={`Member ${i + 1} Username`}
                  value={u}
                  onChange={(e) => handleUsernameChange(i, e.target.value)}
                  required
                />
              </div>
            ))}
            <button type="button" className="add-member-btn" onClick={addUsernameField}>
              + Add Another Member
            </button>
          </div>

          {/* Removed file upload from signup */}

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Creating Account...' : 'Sign Up'}
          </button>

          {error && <div className="error">{error}</div>}
          {message && <div className="success">{message}</div>}
        </form>

        <p className="auth-footer">
          Already have an account?{' '}
          <span className="auth-switch-link" onClick={switchToLogin}>
            Log In
          </span>
        </p>
      </div>
    </div>
  );
}
