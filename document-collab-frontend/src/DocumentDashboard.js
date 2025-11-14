import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import './DocumentDashboard.css';
import { FaTrash } from 'react-icons/fa';

export default function DocumentDashboard() {
  const [docs, setDocs] = useState([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("http://localhost:5050/documents", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDocs(res.data);
    } catch (err) {
      console.error("Fetch documents error:", err);
      if (err.response?.status === 401) await refreshToken(fetchDocuments);
      else setError("Failed to fetch documents.");
    }
  };

  const deleteDocument = async (id) => {
    const ok = window.confirm('Delete this document? This cannot be undone.');
    if (!ok) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`http://localhost:5050/documents/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      if (err.response?.status === 401) await refreshToken(() => deleteDocument(id));
      else alert('Failed to delete document.');
    }
  };

  const refreshToken = async (retryFn) => {
    try {
      const rt = localStorage.getItem("refresh_token");
      const res = await axios.post("http://localhost:5050/refresh", {
        refresh_token: rt,
      });
      localStorage.setItem("token", res.data.access_token);
      if (retryFn) retryFn();
    } catch {
      alert("Session expired. Please log in again.");
      localStorage.clear();
      window.location.href = "/";
    }
  };

  const createDocument = async () => {
    if (!title.trim()) return alert("Please enter a document title!");
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        "http://localhost:5050/documents",
        { title: title.trim() },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setTitle("");
      fetchDocuments();
      navigate(`/editor/${res.data.id}`);
    } catch (err) {
      console.error("Create document error:", err.response || err);
      if (err.response?.status === 401) await refreshToken(createDocument);
      else alert("Failed to create document.");
    } finally {
      setLoading(false);
    }
  };

  const hiddenFileRef = React.useRef(null);
  const onPickUpload = () => hiddenFileRef.current?.click();
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
      const form = new FormData();
      form.append('file', f);
      const token = localStorage.getItem('token');
      const doPost = async (tkn) => axios.post('http://localhost:5050/upload_doc', form, {
        headers: { 'Authorization': `Bearer ${tkn}`, 'Content-Type': 'multipart/form-data' },
      });
      let res;
      try {
        res = await doPost(token);
      } catch (err) {
        if (err?.response?.status === 401) {
          const rt = localStorage.getItem('refresh_token');
          const r = await axios.post('http://localhost:5050/refresh', { refresh_token: rt });
          localStorage.setItem('token', r.data.access_token);
          res = await doPost(r.data.access_token);
        } else {
          throw err;
        }
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
    <div className="dashboard-container page">
      <div className="dashboard-header">
        <h2>Team Documents</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            placeholder="Enter document title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
            style={{
              border: '1px solid var(--brand-border)',
              borderRadius: '10px',
              padding: '10px 12px',
              width: '260px',
            }}
          />
          <button onClick={createDocument} disabled={loading} className="new-doc-btn">
            {loading ? 'Creating...' : '+ New Document'}
          </button>
          <label className="new-doc-btn" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            Upload Document
            <input ref={hiddenFileRef} type="file" accept=".docx" style={{ display: 'none' }} onChange={handleUpload} />
          </label>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {docs.length === 0 ? (
        <p className="empty-msg">No team documents yet.</p>
      ) : (
        <div className="document-grid">
          {docs.map((doc) => (
            <div key={doc.id} className="document-card" onClick={() => navigate(`/editor/${doc.id}`)}>
              <div className="document-card-header">
                <h3>{doc.title || 'Untitled'}</h3>
                <FaTrash
                  className="delete-icon"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteDocument(doc.id);
                  }}
                />
              </div>
              <p>
                {doc.updated_at
                  ? new Date(doc.updated_at).toLocaleString()
                  : 'No updates yet'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
