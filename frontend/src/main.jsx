import React from "react";
import ReactDOM from "react-dom/client";
// Amplify must be configured BEFORE any module that creates an amplify client
// at top level (api.js's generateClient runs at module load). Hoisted above
// App.jsx for that reason.
import "./amplify-config.js";
import App from "./App.jsx";
import "@aws-amplify/ui-react/styles.css";
import "./styles/styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
