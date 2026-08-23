import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { api } from "./services/api";
import type { TeamState } from "./types";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { AdminLoginPage } from "./pages/AdminLoginPage";
import { TrialPage } from "./pages/TrialPage";

export default function App() {
  const [team, setTeam] = useState<TeamState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    api
      .getSession()
      .then((response) => {
        if (active) {
          setTeam(response.team);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <main className="trial-shell"><section className="hero-panel">Loading Riddler...</section></main>;
  }

  return (
    <Routes>
      <Route path="/" element={<TrialPage team={team} setTeam={setTeam} />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
