import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaTrash } from 'react-icons/fa';
import './Auth.css';
import './Settings.css';

export default function Settings({ theme = 'light', onToggleTheme }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [status, setStatus] = useState({ type: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [memberStatus, setMemberStatus] = useState({ type: '', message: '' });
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState('');
  const isDark = (theme || '').toLowerCase() === 'dark';

  const fetchMembers = async () => {
    try {
      setMembersLoading(true);
      setMembersError('');
      const token = localStorage.getItem('token');
      const res = await axios.get('/team_members', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMembers(Array.isArray(res.data?.members) ? res.data.members : []);
    } catch (err) {
      console.error('Fetch members error', err);
      setMembersError(err?.response?.data?.error || 'Failed to load team members.');
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ type: '', message: '' });

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      return setStatus({ type: 'error', message: 'Please fill out all fields.' });
    }
    if (newPassword !== confirmNewPassword) {
      return setStatus({ type: 'error', message: 'New passwords do not match.' });
    }
    if (newPassword.length < 6) {
      return setStatus({ type: 'error', message: 'Password should be at least 6 characters.' });
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const email = localStorage.getItem('email');
      await axios.post(
        '/change_password',
        {
          email,
          current_password: currentPassword,
          new_password: newPassword,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setStatus({ type: 'success', message: 'Password updated successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      const msg = err?.response?.data?.error || 'Failed to update password.';
      setStatus({ type: 'error', message: msg });
    } finally {
      setLoading(false);
    }
  };

  const addMember = async () => {
    const username = newUsername.trim();
    if (!username) {
      return setMemberStatus({ type: 'error', message: 'Enter a username.' });
    }
    try {
      setMemberStatus({ type: '', message: '' });
      setLoading(true);
      const token = localStorage.getItem('token');
      const email = localStorage.getItem('email');
      await axios.post(
        '/add_member',
        { email, new_member: username },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setNewUsername('');
      setMemberStatus({ type: 'success', message: 'Member added successfully.' });
      fetchMembers();
    } catch (err) {
      const msg = err?.response?.data?.error || 'Failed to add member.';
      setMemberStatus({ type: 'error', message: msg });
    } finally {
      setLoading(false);
    }
  };

  const removeMember = async (member) => {
    if (!member) return;
    try {
      const token = localStorage.getItem('token');
      const email = localStorage.getItem('email');
      await axios.post(
        '/remove_member',
        { email, member },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }
      );
      fetchMembers();
    } catch (err) {
      const msg = err?.response?.data?.error || 'Failed to remove member.';
      setMembersError(msg);
    }
  };

  return (
    <div className="auth-bg page">
      <div className="auth-card settings-card">
        <div className="settings-toggle-card">
          <div className="toggle-visual">
            <span className={`mode-label ${!isDark ? 'active' : ''}`}>Light</span>
            <button
              type="button"
              className={`premium-toggle ${isDark ? 'on' : ''}`}
              onClick={() => (typeof onToggleTheme === 'function' ? onToggleTheme() : null)}
              aria-pressed={isDark}
            >
              <span className="toggle-knob" />
            </button>
            <span className={`mode-label ${isDark ? 'active' : ''}`}>Dark</span>
          </div>
        </div>

        <h2 className="auth-title" style={{ marginBottom: '0.4em' }}>Reset Password</h2>
        <p className="auth-subtitle" style={{ marginBottom: '1.5em' }}>
          Update your team's password securely.
        </p>

        <form onSubmit={handleSubmit} className="auth-form" style={{ width: '100%' }}>
          <div className="input-with-icon">
            <input
              type="password"
              placeholder="Current Password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <div className="input-with-icon">
            <input
              type="password"
              placeholder="New Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="input-with-icon">
            <input
              type="password"
              placeholder="Confirm New Password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Updating...' : 'Update Password'}
          </button>

          {status.message && (
            <div className={status.type === 'error' ? 'error' : 'success'} style={{ width: '100%' }}>
              {status.message}
            </div>
          )}
        </form>

        <div className="settings-card secondary-card">
          <h3 style={{ marginBottom: '0.8em', color: 'var(--heading-color)' }}>Add New Team Member</h3>
          <div className="input-with-icon" style={{ marginBottom: '12px' }}>
            <input
              type="text"
              placeholder="New teammate username"
              value={newUsername}
              onChange={(e) => {
                setMemberStatus({ type: '', message: '' });
                setNewUsername(e.target.value);
              }}
            />
          </div>
          <button
            type="button"
            className="auth-btn"
            style={{ width: '100%' }}
            onClick={addMember}
            disabled={loading || !newUsername.trim()}
          >
            Add Member
          </button>
          {memberStatus.message && (
            <div className={memberStatus.type === 'error' ? 'error' : 'success'} style={{ width: '100%' }}>
              {memberStatus.message}
            </div>
          )}
        </div>

        <div className="settings-card secondary-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ marginBottom: '0.4em', color: 'var(--heading-color)' }}>Team Members</h3>
            <button
              type="button"
              onClick={fetchMembers}
              className="auth-btn"
              style={{ width: 'auto', padding: '8px 16px', fontSize: '0.9rem' }}
            >
              Refresh
            </button>
          </div>
          {membersLoading ? (
            <p style={{ color: 'var(--text-color)', opacity: 0.7 }}>Loading members...</p>
          ) : membersError ? (
            <p className="error" style={{ width: '100%' }}>{membersError}</p>
          ) : members.length === 0 ? (
            <p style={{ color: 'var(--text-color)', opacity: 0.7 }}>No team members found.</p>
          ) : (
            <div className="member-list">
              {members.map((member) => (
                <div key={member} className="member-card">
                  <span>{member}</span>
                  <button
                    type="button"
                    className="member-remove"
                    onClick={() => removeMember(member)}
                    title={`Remove ${member}`}
                  >
                    <FaTrash />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
