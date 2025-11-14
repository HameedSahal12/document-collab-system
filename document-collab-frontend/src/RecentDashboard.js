import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import UserPerformance from './components/UserPerformance';
import './RecentDashboard.css';

function RecentDashboard() {
  const [documents, setDocuments] = useState([]);
  const [performanceData, setPerformanceData] = useState([]);
  const [mounted, setMounted] = useState(false);
  const navigate = useNavigate();

  const fetchRecent = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await axios.get('http://localhost:5050/documents', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const sorted = res.data.sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
      setDocuments(sorted.slice(0, 3));
    } catch (err) {
      console.error('Failed to load recent documents:', err);
    }
  };

  useEffect(() => {
    fetchRecent();
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('http://localhost:5050/analytics', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const uc = res.data?.user_contributions || [];
        if (!uc.length) return setPerformanceData([]);
        const maxEdits = Math.max(1, ...uc.map(u => u.edits || 0));
        const maxWords = Math.max(1, ...uc.map(u => u.words_added || 0));
        const perf = uc
          .map(u => {
            const editScore = (u.edits || 0) / maxEdits;
            const wordScore = (u.words_added || 0) / maxWords;
            const percent = Math.round((0.4 * editScore + 0.6 * wordScore) * 100);
            return {
              name: u.username || 'User',
              words: u.words_added || 0,
              edits: u.edits || 0,
              percent,
            };
          })
          .sort((a, b) => b.percent - a.percent);
        setPerformanceData(perf);
      } catch (err) {
        console.error('Failed to load analytics:', err);
        setPerformanceData([]);
      }
    };
    fetchAnalytics();
  }, []);

  const deleteAccount = async () => {
    if (window.confirm('Are you sure you want to delete your account? This cannot be undone.')) {
      const token = localStorage.getItem('token');
      try {
        await axios.delete('http://localhost:5050/delete_account', {
          headers: { Authorization: `Bearer ${token}` },
        });
        alert('Account deleted successfully');
        localStorage.removeItem('token');
        window.location.href = '/';
      } catch (err) {
        alert('Error deleting account: ' + (err.response?.data?.msg || err.message));
      }
    }
  };

  const fileRef = React.useRef(null);
  const pickUpload = () => fileRef.current?.click();
  const handleUpload = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/\.(docx)$/i.test(f.name)) {
      return alert('Please choose a .docx file.');
    }
    if (f.size > 5 * 1024 * 1024) {
      return alert('File too large (max 5 MB).');
    }
    try {
      const token = localStorage.getItem('token');
      const form = new FormData();
      form.append('file', f);
      const doPost = async (tkn) => axios.post('http://localhost:5050/upload_doc', form, {
        headers: { 'Authorization': `Bearer ${tkn}`, 'Content-Type': 'multipart/form-data' },
      });
      let res;
      try { res = await doPost(token); }
      catch (err) {
        if (err?.response?.status === 401) {
          const rt = localStorage.getItem('refresh_token');
          const r = await axios.post('http://localhost:5050/refresh', { refresh_token: rt });
          localStorage.setItem('token', r.data.access_token);
          res = await doPost(r.data.access_token);
        } else { throw err; }
      }
      const id = res?.data?.doc_id;
      if (id) navigate(`/editor/${id}`);
      else alert('Upload succeeded but no document id returned.');
    } catch (err) {
      console.error('Upload error:', err);
      alert(err?.response?.data?.error || err.message || 'Failed to upload document');
    }
  };

  return (
    <div
      className="recent-shell-card page"
      style={{
        padding: '40px',
        maxWidth: '800px',
        margin: '48px auto',
        background: '#fafbfc',
        borderRadius: '14px',
        boxShadow: '0 4px 16px #ebeef1',
      }}
    >
      {(() => {
        const stored = (() => {
          try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
        })();
        const username = stored?.username || localStorage.getItem('username') || 'User';
        return (
          <div
            style={{
              textAlign: 'center',
              marginTop: '4px',
              marginBottom: '28px',
              padding: '10px 8px',
              color: '#0f172a',
              transform: mounted ? 'translateY(0px)' : 'translateY(-6px)',
              opacity: mounted ? 1 : 0,
              transition: 'opacity 420ms ease, transform 420ms ease',
            }}
          >
            <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>Welcome back, {username}</div>
            <div style={{ marginTop: 6, fontSize: '1rem', color: '#475569' }}>
              Here's what your team worked on today.
            </div>
          </div>
        );
      })()}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2
        style={{
          fontWeight: 700,
          marginBottom: '32px',
          fontSize: '2rem',
        }}
      >
        Recently Worked Documents
        </h2>
        <div>
          <button onClick={pickUpload} style={{ background: '#2563eb', color: '#fff', padding: '10px 14px', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Upload Document</button>
          <input ref={fileRef} type="file" accept=".docx" onChange={handleUpload} hidden />
        </div>
      </div>

      {documents.map((doc) => (
        <div
          key={doc.id}
          onClick={() => navigate(`/editor/${doc.id}`)}
          style={{
            background: '#fff',
            padding: '24px 32px',
            borderRadius: '8px',
            marginBottom: '18px',
            boxShadow: '0 1px 4px #ececec',
            cursor: 'pointer'
          }}
        >
          <div style={{ fontWeight: '600', fontSize: '1.15rem' }}>
            {doc.title || 'Untitled'}
          </div>
          <div
            style={{
              color: '#667',
              fontSize: '0.93rem',
              marginTop: '5px',
            }}
          >
            Last updated:{' '}
            {doc.created_at
              ? new Date(
                  doc.created_at.$date ||
                    doc.created_at ||
                    doc.updated_at ||
                    doc.modified_at ||
                    doc.date
                ).toLocaleString('en-US', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
              : 'Not available'}
          </div>
        </div>
      ))}

      {documents.length === 0 && (
        <div
          style={{
            color: '#aaa',
            textAlign: 'center',
            marginTop: '32px',
            fontSize: '1rem',
          }}
        >
          No recent documents found.
        </div>
      )}

      <div className="dashboard-performance" style={{ marginTop: 28 }}>
        <UserPerformance performanceData={performanceData} />
      </div>

      <div style={{ textAlign: 'center', marginTop: '30px' }}>
        <button
          onClick={deleteAccount}
          style={{
            backgroundColor: 'red',
            color: 'white',
            padding: '12px 20px',
            borderRadius: '7px',
            fontWeight: 700,
            border: 'none',
            fontSize: '1rem',
            cursor: 'pointer',
          }}
        >
          Delete Account
        </button>
      </div>
    </div>
  );
}

export default RecentDashboard;
