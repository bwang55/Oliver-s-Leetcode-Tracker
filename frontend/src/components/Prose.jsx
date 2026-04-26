import React from "react";

function Prose({ text }) {
  const parts = text.split(/\n\n+/);
  return (
    <div className="detail-prose">
      {parts.map((p, i) => (
        <p key={i} dangerouslySetInnerHTML={{
          __html: p
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/`([^`]+)`/g, "<code>$1</code>"),
        }} />
      ))}
    </div>
  );
}

export default Prose;
