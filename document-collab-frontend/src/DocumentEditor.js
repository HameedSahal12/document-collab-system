import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { useParams, useNavigate } from "react-router-dom";
import RichEditor from "./components/RichEditor";
import { io } from "socket.io-client";

const API_BASE = "http://localhost:5050";

export default function DocumentEditor() {
  const { docId } = useParams();
  const id = docId;
  const navigate = useNavigate();
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("Idle");
  const socketRef = React.useRef(null);
  const clientIdRef = React.useRef(Math.random().toString(36).slice(2));
  const applyingRemoteRef = React.useRef(false);

  const getToken = () => localStorage.getItem("token");
  const getRefresh = () => localStorage.getItem("refresh_token");

  const refreshToken = useCallback(async () => {
    const rt = getRefresh();
    if (!rt) throw new Error("No refresh token");
    const res = await axios.post(`${API_BASE}/refresh`, { refresh_token: rt });
    localStorage.setItem("token", res.data.access_token);
    return res.data.access_token;
  }, []);

  const withAuth = (token) => ({
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  const fetchDoc = useCallback(async () => {
    try {
      let token = getToken();
      try {
        const res = await axios.get(`${API_BASE}/documents/${id}`, withAuth(token));
        setTitle(res.data.title);
        setContent(res.data.content || "");
      } catch (err) {
        if (err.response?.status === 401) {
          token = await refreshToken();
          const res = await axios.get(`${API_BASE}/documents/${id}`, withAuth(token));
          setTitle(res.data.title);
          setContent(res.data.content || "");
        } else {
          throw err;
        }
      }
    } catch (err) {
      console.error("Load doc error:", err);
      alert("Failed to load document.");
    }
  }, [id, refreshToken]);

  useEffect(() => {
    if (id) fetchDoc();
  }, [id, fetchDoc]);

  // Socket.IO: join a room per document and receive remote updates
  useEffect(() => {
    if (!id) return;
    const username = localStorage.getItem('username') || localStorage.getItem('email') || 'user';
    const s = io(API_BASE, { transports: ['websocket'] });
    socketRef.current = s;
    s.emit('join_doc', { doc_id: id, user: username });

    const onDocUpdate = (payload) => {
      const { content: incoming, client_id } = payload || {};
      if (client_id && client_id === clientIdRef.current) return;
      if (typeof incoming !== 'string') return;
      if (incoming === content) return;
      applyingRemoteRef.current = true;
      setContent(incoming);
      setTimeout(() => { applyingRemoteRef.current = false; }, 50);
    };

    s.on('doc_update', onDocUpdate);

    return () => {
      try { s.emit('leave_doc', { doc_id: id, user: username }); } catch {}
      try { s.off('doc_update', onDocUpdate); } catch {}
      try { s.disconnect(); } catch {}
      socketRef.current = null;
    };
  }, [id, content]);

  // Broadcast local changes to collaborators (debounced)
  useEffect(() => {
    if (!id || !socketRef.current) return;
    const h = setTimeout(() => {
      if (applyingRemoteRef.current) return;
      try {
        socketRef.current.emit('doc_change', {
          doc_id: id,
          content,
          client_id: clientIdRef.current,
        });
      } catch {}
    }, 300);
    return () => clearTimeout(h);
  }, [content, id]);

  const handleSave = useCallback(async () => {
    try {
      setStatus("Saving...");
      let token = getToken();
      try {
        const username = localStorage.getItem('username');
        await axios.post(`${API_BASE}/documents/${id}`, { content, username }, withAuth(token));
      } catch (err) {
        if (err.response?.status === 401) {
          token = await refreshToken();
          const username = localStorage.getItem('username');
          await axios.post(`${API_BASE}/documents/${id}`, { content, username }, withAuth(token));
        } else {
          throw err;
        }
      }
      setStatus("Saved");
      setTimeout(() => setStatus("Idle"), 1500);
    } catch (err) {
      console.error("Save error:", err);
      alert("Failed to save document.");
      setStatus("Idle");
    }
  }, [id, content, refreshToken]);

  // Auto-save after user stops typing
  useEffect(() => {
    if (!id) return;
    const t = setTimeout(() => {
      if (content.trim() !== "") handleSave();
    }, 1500);
    return () => clearTimeout(t);
  }, [content, id, handleSave]);

  return (
    <div className="app-wrapper" style={{ display: 'flex', justifyContent: 'center', padding: '40px 16px' }}>
      <div className="card" style={{ width: 'min(900px, 95vw)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>{title}</h2>
        </div>
        <div style={{ height: 1, background: 'var(--brand-border)', margin: '12px 0 16px' }} />

        <RichEditor
          value={content}
          onChange={setContent}
          onSave={handleSave}
          title={title}
          defaultStyle="body"
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px' }}>
          <span style={{ color: '#64748b', fontSize: '0.9rem' }}>{status}</span>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => navigate('/documents')} className="btn-primary" style={{ background: '#6b7280' }}>Back</button>
            <button onClick={handleSave} className="btn-primary">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
