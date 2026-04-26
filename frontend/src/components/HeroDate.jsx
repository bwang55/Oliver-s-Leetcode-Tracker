import React from "react";
import { fmtBigDate } from "../lib/date.js";

function HeroDate({ todayCount, target }) {
  const now = new Date();
  const big = fmtBigDate(now);
  const hr = now.getHours();
  let timeOfDay = "evening";
  if (hr < 5) timeOfDay = "night";
  else if (hr < 12) timeOfDay = "morning";
  else if (hr < 18) timeOfDay = "afternoon";
  let status = "Let's solve something today.";
  if (todayCount >= target) status = todayCount + " down — goal hit. Keep going.";
  else if (todayCount > 0) status = todayCount + " down — keep going.";
  return (
    <div className="hero-date-wrap">
      <div className="hero-date">
        <span className="month">{big.month}</span> {big.day}{" "}
        <span className="year">{big.year}</span>
      </div>
      <div className="hero-greeting">
        Good {timeOfDay}, Alex.<span className="status">{status}</span>
      </div>
    </div>
  );
}

export default HeroDate;
