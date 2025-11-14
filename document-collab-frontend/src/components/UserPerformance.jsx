import React from "react";
import { motion } from "framer-motion";

// Reusable donut ring used in Analytics
const Donut = ({ percent, size = 120, stroke = 12, color = "#7c3aed" }) => {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const dash = (p / 100) * circumference;
  return (
    <svg width={size} height={size} style={{ display: "block" }}>
      <g transform={`translate(${size / 2}, ${size / 2})`}>
        <circle r={radius} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
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
          {`${Math.round(p)}%`}
        </text>
      </g>
    </svg>
  );
};

// Default color palette used in Analytics
const donutColors = [
  "#7c3aed",
  "#06b6d4",
  "#ef4444",
  "#10b981",
  "#f59e0b",
  "#2563eb",
  "#db2777",
];

// Accepts items like: { name, words, edits, percent or percentage }
const UserPerformance = ({ performanceData = [], title = "User Performance" }) => {
  const safe = Array.isArray(performanceData) ? performanceData : [];

  if (!safe.length) return null;

  return (
    <section style={{ marginBottom: "60px" }} className="user-performance">
      <h3 style={{ fontWeight: 600, marginBottom: 16 }}>{title}</h3>
      <div
        className="performance-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 20,
        }}
      >
        {safe.map((u, i) => {
          const value = u.percent ?? u.percentage ?? 0;
          return (
            <motion.div
              key={(u.name || "user") + i}
              whileHover={{ scale: 1.03 }}
              className="performance-card"
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
              <Donut percent={value} color={donutColors[i % donutColors.length]} />
              <div style={{ marginTop: 10, fontWeight: 700, color: "#0f172a" }}>
                {u.name}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
                {(u.words || 0)} words • {(u.edits || 0)} edits
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
};

export default UserPerformance;

