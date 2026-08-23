import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../services/api";

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await api.adminLogin(email, password);
      navigate("/admin/dashboard");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="admin-shell admin-login">
      <section className="admin-panel narrow">
        <span className="eyebrow">RIDDLER ADMIN</span>
        <h1>Coordinator Access</h1>
        <form onSubmit={handleSubmit} className="stack-form">
          <label>
            <span>Email</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </label>
          <label>
            <span>Password</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              required
            />
          </label>
          {error ? <p className="feedback error">{error}</p> : null}
          <button type="submit" className="primary-button" disabled={loading}>
            {loading ? "ENTERING..." : "ENTER DASHBOARD"}
          </button>
        </form>
      </section>
    </main>
  );
}
