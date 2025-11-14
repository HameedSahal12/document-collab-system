import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend
} from "recharts";
import { motion } from "framer-motion";
import UserPerformance from "./components/UserPerformance";

function Analytics() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const axisTickStyle = { fill: "var(--text-color)", fontSize: 12 };
  const tooltipStyle = {
    background: "var(--card-bg)",
    border: "1px solid var(--border-color)",
    borderRadius: "8px",
    color: "var(--text-color)",
  };
  const legendStyle = { color: "var(--text-color)" };
  const gridColor = "rgba(255,255,255,0.1)";

  useEffect(() => {
    const token = localStorage.getItem("token");
    axios
      .get("http://localhost:5050/analytics", {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        setAnalytics(res.data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const refetchAnalytics = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const res = await axios.get("http://localhost:5050/analytics", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAnalytics(res.data || null);
    } catch (err) {
      console.error(err);
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  };

  const resetAnalytics = async () => {
    if (!window.confirm("Reset analytics for this team? This deletes activity logs used to compute analytics.")) return;
    const token = localStorage.getItem("token");
    try {
      const doPost = async () => axios.post("http://localhost:5050/analytics/reset", {}, {
        headers: { Authorization: `Bearer ${token}` },
      });

      let res;
      try {
        res = await doPost();
      } catch (err) {
        if (err?.response?.status === 401) {
          const rt = localStorage.getItem("refresh_token");
          if (!rt) throw err;
          const r = await axios.post("http://localhost:5050/refresh", { refresh_token: rt });
          localStorage.setItem("token", r.data.access_token);
          res = await axios.post("http://localhost:5050/analytics/reset", {}, {
            headers: { Authorization: `Bearer ${r.data.access_token}` },
          });
        } else {
          throw err;
        }
      }
      const deleted = res?.data?.deleted ?? 0;
      alert(`Analytics reset. Deleted ${deleted} activity log(s).`);
      await refetchAnalytics();
    } catch (err) {
      console.error("Reset analytics error:", err);
      alert(err?.response?.data?.error || err.message || "Failed to reset analytics");
    }
  };

  if (loading) {
    return (
      <div className="page" style={{ textAlign: "center", marginTop: "100px", fontWeight: 600 }}>
        Loading analytics...
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="page" style={{ textAlign: "center", marginTop: "100px", color: "#777" }}>
        No analytics data available yet.
      </div>
    );
  }

  const {
    user_contributions = [],
    collaboration_timeline = [],
    badges = [],
    anomalies = [],
    contributors = [],
    collaboration_matrix,
    alerts = []
  } = analytics;

  // Top Contributors by words
  const contributorsWords = (contributors.length ? contributors : [])
    .map(c => ({ name: c.username || c.user_email, words: c.total_words }))
    .sort((a, b) => b.words - a.words);

  // Heatmap helpers
  const matrix = collaboration_matrix?.counts || null;
  const days = collaboration_matrix?.days || ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const hours = collaboration_matrix?.hours || Array.from({ length: 24 }, (_, i) => i);
  const maxCell = matrix ? Math.max(1, ...matrix.flat()) : 1;
  const cellColor = (v) => {
    const t = Math.min(1, v / maxCell);
    const start = { r: 219, g: 234, b: 254 }; // #DBEAFE
    const end = { r: 37, g: 99, b: 235 };    // #2563EB
    const r = Math.round(start.r + (end.r - start.r) * t);
    const g = Math.round(start.g + (end.g - start.g) * t);
    const b = Math.round(start.b + (end.b - start.b) * t);
    return `rgb(${r}, ${g}, ${b})`;
  };

  // Donut ring component (SVG based)
  const Donut = ({ percent, size = 120, stroke = 12, color = "#7c3aed" }) => {
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const dash = Math.max(0, Math.min(100, percent)) / 100 * circumference;
    return (
      <svg width={size} height={size} style={{ display: "block" }}>
        <g transform={`translate(${size / 2}, ${size / 2})`}>
          <circle
            r={radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={stroke}
          />
          <circle
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            transform="rotate(-90)"
          />
          <text
            textAnchor="middle"
            dominantBaseline="middle"
            fontWeight="700"
            fontSize={18}
            fill="#111827"
          >
            {`${Math.round(percent)}%`}
          </text>
        </g>
      </svg>
    );
  };

  // Build simple performance score per user from contributions
  const performanceData = (() => {
    if (!user_contributions?.length) return [];
    const maxEdits = Math.max(1, ...user_contributions.map(u => u.edits || 0));
    const maxWords = Math.max(1, ...user_contributions.map(u => u.words_added || 0));
    // Weighted score: 60% words, 40% edits
    return user_contributions
      .map(u => {
        const editScore = (u.edits || 0) / maxEdits;
        const wordScore = (u.words_added || 0) / maxWords;
        const score = (0.4 * editScore + 0.6 * wordScore) * 100;
        return {
          name: u.username || "User",
          percent: Math.round(score),
          edits: u.edits || 0,
          words: u.words_added || 0,
        };
      })
      .sort((a, b) => b.percent - a.percent);
  })();
  const donutColors = ["#7c3aed", "#06b6d4", "#ef4444", "#10b981", "#f59e0b", "#2563eb", "#db2777"];

  return (
    <div className="analytics-page page" style={{ padding: "40px", maxWidth: "1100px", margin: "0 auto" }}>
      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        style={{ fontSize: "2rem", fontWeight: "700", marginBottom: "40px" }}
      >
        Intelligent Document Usage & Productivity Insights
      </motion.h2>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button
          onClick={resetAnalytics}
          style={{
            background: '#ef4444',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '8px 12px',
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}
          title="Delete activity logs for this team"
        >
          Reset Analytics
        </button>
      </div>

      {/* USER PERFORMANCE DONUTS */}
      <UserPerformance performanceData={performanceData} />
      {false && performanceData.length > 0 && (
        <section style={{ marginBottom: "60px" }}>
          <h3 style={{ fontWeight: "600", marginBottom: "16px" }}>User Performance</h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "20px",
            }}
          >
            {performanceData.map((u, i) => (
              <motion.div
                key={u.name + i}
                whileHover={{ scale: 1.03 }}
                style={{
                  background: "#fff",
                  borderRadius: 16,
                  padding: 18,
                  boxShadow: "0 8px 20px rgba(99,102,241,0.08)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                }}
              >
                <Donut percent={u.percent} color={donutColors[i % donutColors.length]} />
                <div style={{ marginTop: 10, fontWeight: 700, color: "#0f172a" }}>{u.name}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
                  {u.words} words • {u.edits} edits
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* TOP CONTRIBUTORS */}
      <section style={{ marginBottom: "60px" }}>
        <h3 style={{ fontWeight: "600", marginBottom: "20px" }}>Top Contributors (Words Added)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={contributorsWords}>
            <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={axisTickStyle} stroke="var(--border-color)" />
            <YAxis tick={axisTickStyle} stroke="var(--border-color)" />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={legendStyle} />
            <Bar dataKey="words" fill="#3B82F6" name="Words Added" />
          </BarChart>
        </ResponsiveContainer>
      </section>

      {/* USER CONTRIBUTIONS (edits vs. words) */}
      {user_contributions?.length > 0 && (
        <section style={{ marginBottom: "60px" }}>
          <h3 style={{ fontWeight: "600", marginBottom: "20px" }}>Per-User Contribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={user_contributions}>
              <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
              <XAxis dataKey="username" tick={axisTickStyle} stroke="var(--border-color)" />
              <YAxis tick={axisTickStyle} stroke="var(--border-color)" />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={legendStyle} />
              <Bar dataKey="edits" fill="#10B981" name="Total Edits" />
              <Bar dataKey="words_added" fill="#F43F5E" name="Words Added" />
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}

      {/* COLLABORATION HEATMAP (Days x Hours) */}
      {matrix && (
        <section style={{ marginBottom: "60px" }}>
          <h3 style={{ fontWeight: "600", marginBottom: "12px" }}>Collaboration Heatmap</h3>
          <div style={{ overflowX: "auto", paddingBottom: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: `80px repeat(${hours.length}, 1fr)`, gap: 2 }}>
              <div />
              {hours.map(h => (
                <div
                  key={`h-${h}`}
                  style={{ textAlign: "center", fontSize: 12, color: "var(--text-color)", opacity: 0.7 }}
                >
                  {h}
                </div>
              ))}
              {days.map((d, i) => (
                <React.Fragment key={`row-${d}`}>
                  <div
                    style={{
                      position: "sticky",
                      left: 0,
                      background: "var(--card-bg)",
                      fontWeight: 600,
                      color: "var(--text-color)",
                    }}
                  >
                    {d}
                  </div>
                  {hours.map(h => (
                    <div key={`c-${i}-${h}`} title={`${d} ${h}:00 -> ${matrix[i][h]} edits`}
                      style={{ height: 18, borderRadius: 3, background: cellColor(matrix[i][h]) }} />
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* HOURLY ACTIVITY LINE (extra) */}
      <section style={{ marginBottom: "60px" }}>
        <h3 style={{ fontWeight: "600", marginBottom: "20px" }}>Collaboration Activity (Hourly)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={collaboration_timeline}>
            <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
            <XAxis
              dataKey="hour"
              label={{ value: "Hour of Day", position: "insideBottomRight", offset: -5, fill: "var(--text-color)" }}
              tick={axisTickStyle}
              stroke="var(--border-color)"
            />
            <YAxis tick={axisTickStyle} stroke="var(--border-color)" />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={legendStyle} />
            <Line type="monotone" dataKey="activity" stroke="var(--button-bg)" strokeWidth={3} />
          </LineChart>
        </ResponsiveContainer>
      </section>

      {/* BADGES */}
      <section style={{ marginBottom: "60px" }}>
        <h3 style={{ fontWeight: "600", marginBottom: "20px" }}>Productivity Badges</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "15px" }}>
          {badges.map((badge, i) => (
            <motion.div
              key={i}
              whileHover={{ scale: 1.05 }}
              style={{
                background: "#fff",
                padding: "18px 28px",
                borderRadius: "10px",
                boxShadow: "0 2px 8px #e0e7ff",
                fontWeight: "600",
                color: "#334155",
                minWidth: "200px",
              }}
            >
              Badge: {badge.username}: {badge.title}
            </motion.div>
          ))}
        </div>
      </section>

      {/* ANOMALY ALERTS */}
      <section>
        <h3 style={{ fontWeight: "600", marginBottom: "20px" }}>Team Activity Status</h3>
        {anomalies.length > 0 || alerts.length > 0 ? (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {[...anomalies.map(a => a.message), ...alerts].map((msg, i) => (
              <li
                key={i}
                style={{
                  background: "#fee2e2",
                  borderLeft: "6px solid #dc2626",
                  padding: "14px 18px",
                  marginBottom: "10px",
                  borderRadius: "8px",
                }}
              >
              Alert: {msg}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: "#22c55e", fontWeight: 600 }}>All team members are active!</p>
        )}
      </section>
    </div>
  );
}

export default Analytics;
