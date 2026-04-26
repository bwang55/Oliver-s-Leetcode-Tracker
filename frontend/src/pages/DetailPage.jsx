import React from "react";
import Icon from "../components/Icon.jsx";
import TagList from "../components/TagList.jsx";
import Prose from "../components/Prose.jsx";
import CodeBlock from "../components/CodeBlock.jsx";
import { fmtDayHeader, fmtTime } from "../lib/date.js";

function DetailPage({ problem, onBack, onUpdate }) {
  const head = fmtDayHeader(problem.solvedAt);
  const setTags = (tags) => onUpdate({ ...problem, tags });
  console.log("[DetailPage]", problem.id, problem.number, problem.title,
    "| solutions type:", typeof problem.solutions,
    "| keys:", problem.solutions && typeof problem.solutions === "object" ? Object.keys(problem.solutions) : "(not object)",
    "| python length:", problem.solutions?.python?.length ?? "n/a");
  return (
    <div className="detail">
      <button className="back-btn" onClick={onBack}>
        <Icon.ArrowLeft /> Back to tracker
      </button>
      <div className="detail-meta">
        #{problem.number} <span style={{ margin: "0 6px" }}>·</span>
        <span className="diff" data-difficulty={problem.difficulty}>{problem.difficulty}</span>
        <span style={{ margin: "0 6px" }}>·</span>
        solved {head.rel} at {fmtTime(problem.solvedAt)}
      </div>
      <h1 className="detail-title">{problem.title}</h1>
      <TagList tags={problem.tags} onChange={setTags} />
      <div className="section-label">Problem</div>
      <Prose text={problem.description} />
      {problem.constraints && problem.constraints.length > 0 && (
        <>
          <div className="section-label">Constraints</div>
          <ul className="constraints">
            {problem.constraints.map((c, i) => (<li key={i}>{c}</li>))}
          </ul>
        </>
      )}
      <div className="section-label">Solution</div>
      <CodeBlock solutions={problem.solutions} />
      {problem.note && (
        <>
          <div className="section-label">My take</div>
          <div className="note-block">
            <span className="label">Note ·</span>
            {problem.note}
          </div>
        </>
      )}
    </div>
  );
}

export default DetailPage;
