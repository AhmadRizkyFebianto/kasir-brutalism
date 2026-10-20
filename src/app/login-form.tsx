"use client";

import { FormEvent, useState } from "react";
import { LockKeyhole, LoaderCircle } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setError("Konfigurasi Supabase belum lengkap.");
      setBusy(false);
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) setError("Email atau kata sandi tidak cocok, atau akun belum diaktifkan.");
    else onLogin();
  }

  return <form className="login-card" onSubmit={submit}>
    <div className="login-icon"><LockKeyhole size={21} /></div>
    <div className="login-eyebrow">KOPI &amp; SPACE HUB / POS</div>
    <h1>Masuk ke terminal</h1>
    <p>Gunakan akun kasir yang terdaftar pada gerai ini.</p>
    <label>Email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="kasir@kopispace.id" /></label>
    <label>Kata sandi<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••••" /></label>
    {error && <div className="login-error" role="alert">{error}</div>}
    <button className="login-submit" type="submit" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin" /> : <LockKeyhole size={16} />} Masuk ke Kasir</button>
  </form>;
}
