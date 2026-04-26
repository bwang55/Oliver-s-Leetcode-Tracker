import React, { useState, useMemo } from "react";
import {
  signIn, signUp, confirmSignUp, resendSignUpCode,
  resetPassword, confirmResetPassword, signInWithRedirect, autoSignIn
} from "aws-amplify/auth";

// =====================================================
// Auth page — sign in / sign up / forgot / verify
// Ported from the standalone design mockup; wired to
// real Amplify (Cognito) auth APIs.
// =====================================================

function attachRipple(e) {
  const btn = e.currentTarget;
  if (!btn || typeof btn.getBoundingClientRect !== "function") return;
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = e.clientX - rect.left - size / 2;
  const y = e.clientY - rect.top - size / 2;
  const r = document.createElement("span");
  r.className = "ripple";
  r.style.width = r.style.height = size + "px";
  r.style.left = x + "px";
  r.style.top = y + "px";
  btn.appendChild(r);
  setTimeout(() => r.remove(), 620);
}

const Eye = ({ open }) =>
  open ? (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l10 10" />
      <path d="M6.5 4c.5-.1 1-.2 1.5-.2 4 0 6.5 4.2 6.5 4.2s-.6 1-1.7 2.1" />
      <path d="M9.5 11.7c-.5.2-1 .3-1.5.3-4 0-6.5-4-6.5-4S2.6 6.4 4 5.2" />
    </svg>
  );

const Check = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 5.2 4.2 7.5 8.5 2.5" />
  </svg>
);

const GoogleG = () => (
  <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.61z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
    <path fill="#FBBC05" d="M3.97 10.71a5.41 5.41 0 0 1 0-3.43V4.96H.96a9 9 0 0 0 0 8.08z"/>
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.99 8.99 0 0 0 .96 4.96l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58z"/>
  </svg>
);

const Mail = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);

function Field({ id, label, type = "text", value, onChange, error, autoComplete, autoFocus, inputMode }) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const t = isPassword && show ? "text" : type;
  return (
    <div className={"field" + (value ? " has-value" : "") + (error ? " error" : "")}>
      <input
        id={id}
        type={t}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        spellCheck={false}
        inputMode={inputMode}
      />
      <label htmlFor={id}>{label}</label>
      {isPassword && (
        <button type="button" className="toggle-eye" onClick={() => setShow((s) => !s)} tabIndex={-1} aria-label={show ? "Hide password" : "Show password"}>
          <Eye open={show} />
        </button>
      )}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}

function strengthOf(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) s++;
  return Math.min(4, s);
}
const STRENGTH_LABEL = ["", "Weak", "Fair", "Good", "Strong"];

function Strength({ pw }) {
  const lvl = strengthOf(pw);
  if (!pw) return null;
  return (
    <>
      <div className={"strength lvl" + lvl}>
        <span className="strength-bar" />
        <span className="strength-bar" />
        <span className="strength-bar" />
        <span className="strength-bar" />
      </div>
      <div className="strength-label">{STRENGTH_LABEL[lvl]} password</div>
    </>
  );
}

function FormError({ message }) {
  if (!message) return null;
  return <div className="auth-form-error">{message}</div>;
}

// ---------- panes ----------
function SignIn({ goSignUp, goForgot, onNeedConfirm, onSignedIn }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [remember, setRemember] = useState(true);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [topErr, setTopErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    attachRipple(e);
    const next = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) next.email = "Enter a valid email";
    if (pw.length < 6) next.pw = "At least 6 characters";
    setErrs(next);
    setTopErr("");
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const res = await signIn({ username: email, password: pw });
      if (res.isSignedIn) {
        onSignedIn();
        return;
      }
      // Cognito returns a nextStep — handle the common ones gracefully.
      const step = res.nextStep?.signInStep;
      if (step === "CONFIRM_SIGN_UP") {
        onNeedConfirm(email);
        return;
      }
      setTopErr(`Additional step required: ${step || "unknown"}`);
    } catch (err) {
      const name = err?.name || "";
      if (name === "UserNotConfirmedException") {
        try { await resendSignUpCode({ username: email }); } catch {}
        onNeedConfirm(email);
        return;
      }
      setTopErr(err?.message || "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async (e) => {
    attachRipple(e);
    try {
      await signInWithRedirect({ provider: "Google" });
    } catch (err) {
      setTopErr("Google sign-in is not enabled yet — use email + password for now.");
    }
  };

  return (
    <div className="auth-pane" key="signin">
      <h2 className="title">Welcome back.</h2>
      <p className="subtitle">Sign in to keep your streak alive.</p>

      <button className="btn-google" onClick={onGoogle} type="button">
        <GoogleG /> Continue with Google
      </button>
      <div className="or">or</div>

      <FormError message={topErr} />
      <form onSubmit={submit} noValidate>
        <Field id="si-email" label="Email" type="email" value={email} onChange={setEmail} error={errs.email} autoComplete="email" autoFocus />
        <Field id="si-pw" label="Password" type="password" value={pw} onChange={setPw} error={errs.pw} autoComplete="current-password" />

        <div className="row-between">
          <label className="checkbox">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span className="box"><Check /></span>
            Remember me
          </label>
          <button type="button" className="link-quiet" onClick={() => goForgot(email)}>Forgot?</button>
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? <><span className="spinner" /> Signing in…</> : "Sign in"}
        </button>
      </form>

      <div className="tos">
        Don't have an account?{" "}
        <a href="#" onClick={(e) => { e.preventDefault(); goSignUp(); }}>Create one</a>
      </div>
    </div>
  );
}

function SignUp({ goSignIn, onNeedConfirm }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [agree, setAgree] = useState(false);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [topErr, setTopErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    attachRipple(e);
    const next = {};
    if (name.trim().length < 2) next.name = "Tell us your name";
    if (!/^\S+@\S+\.\S+$/.test(email)) next.email = "Enter a valid email";
    if (strengthOf(pw) < 2) next.pw = "Use at least 8 characters with letters and numbers";
    if (!agree) next.agree = "Accept the terms to continue";
    setErrs(next);
    setTopErr("");
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await signUp({
        username: email,
        password: pw,
        options: {
          userAttributes: { email, name: name.trim() },
          autoSignIn: true
        }
      });
      onNeedConfirm(email);
    } catch (err) {
      setTopErr(err?.message || "Sign-up failed");
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async (e) => {
    attachRipple(e);
    try {
      await signInWithRedirect({ provider: "Google" });
    } catch (err) {
      setTopErr("Google sign-up is not enabled yet — use email + password for now.");
    }
  };

  return (
    <div className="auth-pane" key="signup">
      <h2 className="title">Start tracking.</h2>
      <p className="subtitle">Free forever for personal use.</p>

      <button className="btn-google" onClick={onGoogle} type="button">
        <GoogleG /> Sign up with Google
      </button>
      <div className="or">or</div>

      <FormError message={topErr} />
      <form onSubmit={submit} noValidate>
        <Field id="su-name" label="Name" value={name} onChange={setName} error={errs.name} autoComplete="name" autoFocus />
        <Field id="su-email" label="Email" type="email" value={email} onChange={setEmail} error={errs.email} autoComplete="email" />
        <Field id="su-pw" label="Password" type="password" value={pw} onChange={setPw} error={errs.pw} autoComplete="new-password" />
        <Strength pw={pw} />

        <div style={{ marginTop: 18 }}>
          <label className="checkbox">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span className="box"><Check /></span>
            I agree to the Terms and Privacy Policy
          </label>
          {errs.agree && <div className="field-error" style={{ marginTop: 8 }}>{errs.agree}</div>}
        </div>

        <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 18 }} disabled={busy}>
          {busy ? <><span className="spinner" /> Creating account…</> : "Create account"}
        </button>
      </form>

      <div className="tos">
        Already a member?{" "}
        <a href="#" onClick={(e) => { e.preventDefault(); goSignIn(); }}>Sign in</a>
      </div>
    </div>
  );
}

function ConfirmSignUp({ email, onConfirmed, goSignIn }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [topErr, setTopErr] = useState("");
  const [info, setInfo] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    attachRipple(e);
    if (!/^\d{4,8}$/.test(code.trim())) {
      setTopErr("Enter the 6-digit code from your email");
      return;
    }
    setBusy(true);
    setTopErr("");
    try {
      await confirmSignUp({ username: email, confirmationCode: code.trim() });
      // Try the auto-signIn flow that signUp({ autoSignIn: true }) primed.
      try {
        const auto = await autoSignIn();
        if (auto?.isSignedIn) {
          onConfirmed();
          return;
        }
      } catch { /* fall through to manual sign-in */ }
      onConfirmed();
    } catch (err) {
      setTopErr(err?.message || "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setTopErr("");
    setInfo("");
    try {
      await resendSignUpCode({ username: email });
      setInfo("New code sent.");
    } catch (err) {
      setTopErr(err?.message || "Couldn't resend code");
    }
  };

  return (
    <div className="auth-pane" key="confirm-signup">
      <div className="success-card">
        <div className="success-icon"><Mail /></div>
        <h3>One last step.</h3>
        <p>
          We sent a 6-digit code to <span className="email-strong">{email}</span>. Enter it below to
          start tracking your problems.
        </p>
      </div>

      <FormError message={topErr} />
      {info && <div className="auth-form-info">{info}</div>}

      <form onSubmit={submit} noValidate>
        <Field
          id="cf-code" label="Verification code" value={code} onChange={setCode}
          autoComplete="one-time-code" inputMode="numeric" autoFocus
        />
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? <><span className="spinner" /> Verifying…</> : "Verify and continue"}
        </button>
      </form>

      <div className="tos">
        Didn't get it? <a href="#" onClick={(e) => { e.preventDefault(); resend(); }}>Resend code</a>
        {" · "}
        <a href="#" onClick={(e) => { e.preventDefault(); goSignIn(); }}>Back to sign in</a>
      </div>
    </div>
  );
}

function Forgot({ initialEmail = "", goSignIn, onCodeSent }) {
  const [email, setEmail] = useState(initialEmail);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [topErr, setTopErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    attachRipple(e);
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setErrs({ email: "Enter a valid email" });
      return;
    }
    setErrs({});
    setTopErr("");
    setBusy(true);
    try {
      await resetPassword({ username: email });
      onCodeSent(email);
    } catch (err) {
      setTopErr(err?.message || "Couldn't send reset link");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-pane" key="forgot">
      <h2 className="title">Reset password.</h2>
      <p className="subtitle">We'll email you a one-time code.</p>

      <FormError message={topErr} />
      <form onSubmit={submit} noValidate>
        <Field id="fp-email" label="Email" type="email" value={email} onChange={setEmail} error={errs.email} autoComplete="email" autoFocus />
        <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 6 }} disabled={busy}>
          {busy ? <><span className="spinner" /> Sending…</> : "Send reset code"}
        </button>
      </form>

      <div className="tos">
        Remembered it?{" "}
        <a href="#" onClick={(e) => { e.preventDefault(); goSignIn(); }}>Back to sign in</a>
      </div>
    </div>
  );
}

function ConfirmReset({ email, onResetDone, goSignIn }) {
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [topErr, setTopErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    attachRipple(e);
    const next = {};
    if (!/^\d{4,8}$/.test(code.trim())) next.code = "Enter the code from your email";
    if (strengthOf(pw) < 2) next.pw = "Use at least 8 characters with letters and numbers";
    setErrs(next);
    setTopErr("");
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await confirmResetPassword({
        username: email, confirmationCode: code.trim(), newPassword: pw
      });
      onResetDone();
    } catch (err) {
      setTopErr(err?.message || "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-pane" key="confirm-reset">
      <h2 className="title">Choose a new password.</h2>
      <p className="subtitle">
        Enter the code we sent to <span className="email-strong">{email}</span>.
      </p>

      <FormError message={topErr} />
      <form onSubmit={submit} noValidate>
        <Field
          id="cr-code" label="Verification code" value={code} onChange={setCode}
          error={errs.code} autoComplete="one-time-code" inputMode="numeric" autoFocus
        />
        <Field
          id="cr-pw" label="New password" type="password" value={pw} onChange={setPw}
          error={errs.pw} autoComplete="new-password"
        />
        <Strength pw={pw} />
        <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 14 }} disabled={busy}>
          {busy ? <><span className="spinner" /> Updating…</> : "Update password"}
        </button>
      </form>

      <div className="tos">
        <a href="#" onClick={(e) => { e.preventDefault(); goSignIn(); }}>Back to sign in</a>
      </div>
    </div>
  );
}

// ---------- App ----------
export default function AuthPage({ onSignedIn }) {
  // mode: signin | signup | confirmSignUp | forgot | confirmReset
  const [mode, setMode] = useState("signin");
  const [pendingEmail, setPendingEmail] = useState("");

  const topbarRight = useMemo(() => {
    if (mode === "signin")
      return (
        <>
          <span>New here?</span>
          <a className="switch-link" href="#" onClick={(e) => { e.preventDefault(); setMode("signup"); }}>Create account</a>
        </>
      );
    if (mode === "signup")
      return (
        <>
          <span>Have an account?</span>
          <a className="switch-link" href="#" onClick={(e) => { e.preventDefault(); setMode("signin"); }}>Sign in</a>
        </>
      );
    return null;
  }, [mode]);

  return (
    <div className="auth">
      <aside className="auth-aside">
        <span className="auth-mark" aria-hidden="true" />
        <div className="brand">
          <div className="brand-mark">L</div>
          <span>Oliver's Leetcode Tracker</span>
        </div>
        <div className="auth-pull">
          <h1>
            One paste.<br />
            <em>Tagged, sorted, tracked.</em>
          </h1>
          <p>
            Drop in a solution and we'll figure out the problem, difficulty, and tags. Watch
            your streak fill in, day by day.
          </p>
        </div>
        <div className="auth-foot">
          <span>© 2026 Oliver's LC Tracker</span>
          <span><a href="#">Terms</a> · <a href="#">Privacy</a></span>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-topbar">{topbarRight}</div>
        <div className="auth-card">
          <div className="auth-stage">
            {mode === "signin" && (
              <SignIn
                goSignUp={() => setMode("signup")}
                goForgot={(email) => { setPendingEmail(email); setMode("forgot"); }}
                onNeedConfirm={(email) => { setPendingEmail(email); setMode("confirmSignUp"); }}
                onSignedIn={onSignedIn}
              />
            )}
            {mode === "signup" && (
              <SignUp
                goSignIn={() => setMode("signin")}
                onNeedConfirm={(email) => { setPendingEmail(email); setMode("confirmSignUp"); }}
              />
            )}
            {mode === "confirmSignUp" && (
              <ConfirmSignUp
                email={pendingEmail}
                onConfirmed={onSignedIn}
                goSignIn={() => setMode("signin")}
              />
            )}
            {mode === "forgot" && (
              <Forgot
                initialEmail={pendingEmail}
                goSignIn={() => setMode("signin")}
                onCodeSent={(email) => { setPendingEmail(email); setMode("confirmReset"); }}
              />
            )}
            {mode === "confirmReset" && (
              <ConfirmReset
                email={pendingEmail}
                onResetDone={() => setMode("signin")}
                goSignIn={() => setMode("signin")}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
