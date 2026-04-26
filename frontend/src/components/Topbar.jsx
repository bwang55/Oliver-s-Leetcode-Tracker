import React, { useState, useEffect, useRef } from "react";
import Icon from "./Icon.jsx";

function Topbar(props) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const isDark = props.theme === "dark";
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">L</div>
        <span>Leetcode Tracker</span>
      </div>
      <div className="topbar-actions">
        <button className="icon-btn" aria-label="Search" onClick={props.onSearch}>
          <Icon.Search />
        </button>
        <div className="dropdown-wrap" ref={ref}>
          <button className="avatar" onClick={() => setOpen((v) => !v)} aria-label="Account">A</button>
          {open && (
            <div className="dropdown" role="menu">
              <div className="dropdown-meta">
                <div className="name">Alex Liu</div>
                <div className="email">alex@example.com</div>
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
