import React from "react";

function SkeletonTile() {
  return (
    <div className="skel">
      <div className="skel-bar short" />
      <div className="skel-bar tall" />
      <div className="skel-pills">
        <span className="skel-pill" style={{ width: 50 }} />
        <span className="skel-pill" style={{ width: 64 }} />
        <span className="skel-pill" style={{ width: 38 }} />
      </div>
    </div>
  );
}

export default SkeletonTile;
