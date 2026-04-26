import React, { useState, useEffect, useRef } from "react";
import { fetchUserAttributes } from "aws-amplify/auth";
import Icon from "./Icon.jsx";

// Pull a display name + email out of the Cognito user object. The Authenticator
// flow exposes `signInDetails.loginId` (the email used to sign in) and the
// raw `username`. The `name` attribute (set by the SignUp form) lives on the
// user pool's userAttributes, which we fetch separately on mount.
function deriveDisplay(user, attributes) {
  const email =
    attributes?.email ||
    user?.signInDetails?.loginId ||
    user?.username ||
    "";
  const name =
    attributes?.name ||
    attributes?.given_name ||
    (email ? email.split("@")[0] : "") ||
    "Account";
  const initial = (name || email || "?").trim().charAt(0).toUpperCase() || "?";
  return { name, email, initial };
}

function Topbar(props) {
  const [open, setOpen] = useState(false);
  const [attributes, setAttributes] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Cognito's `getCurrentUser` doesn't return user-pool attributes (name etc.);
  // fetch them once on mount.
  useEffect(() => {
    let cancelled = false;
    fetchUserAttributes()
      .then((attrs) => { if (!cancelled) setAttributes(attrs); })
      .catch(() => { /* fine — we fall back to email-derived values */ });
    return () => { cancelled = true; };
  }, []);

  const isDark = props.theme === "dark";
  const { name, email, initial } = deriveDisplay(props.user, attributes);

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">L</div>
        <span>Oliver's Leetcode Tracker</span>
      </div>
      <div className="topbar-actions">
        <button className="icon-btn" aria-label="Search" onClick={props.onSearch}>
          <Icon.Search />
        </button>
        <div className="dropdown-wrap" ref={ref}>
          <button className="avatar" onClick={() => setOpen((v) => !v)} aria-label="Account">{initial}</button>
          {open && (
            <div className="dropdown" role="menu">
              <div className="dropdown-meta">
                <div className="name">{name}</div>
                <div className="email">{email}</div>
              </div>
              <button className="dropdown-item" onClick={() => { props.onToggleTheme(); }}>
                {isDark ? <Icon.Sun /> : <Icon.Moon />}
                <span>{isDark ? "Light mode" : "Dark mode"}</span>
              </button>
              <button className="dropdown-item">Account</button>
              <button className="dropdown-item">Send feedback</button>
              <button className="dropdown-item" onClick={props.onSignOut}>Sign out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Topbar;
