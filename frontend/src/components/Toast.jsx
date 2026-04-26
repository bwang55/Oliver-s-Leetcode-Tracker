import React, { useState, useEffect } from "react";

function Toast({ message, onDone }) {
  const [out, setOut] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setOut(true), 2400);
    const t2 = setTimeout(() => onDone && onDone(), 2700);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);
  return <div className={"toast" + (out ? " out" : "")}>{message}</div>;
}

export default Toast;
