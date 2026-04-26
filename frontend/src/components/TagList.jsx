import React from "react";

function TagList({ tags, onChange }) {
  const remove = (t) => onChange(tags.filter((x) => x !== t));
  const add = () => {
    const v = window.prompt("Add tag");
    if (v && v.trim()) onChange([...tags, v.trim().toLowerCase()]);
  };
  return (
    <div className="detail-tags">
      {tags.map((t) => (
        <span className="tag" key={t} onClick={() => remove(t)}>
          {t}
          <span className="x">×</span>
        </span>
      ))}
      <button className="tag-add" onClick={add}>+ add tag</button>
    </div>
  );
}

export default TagList;
