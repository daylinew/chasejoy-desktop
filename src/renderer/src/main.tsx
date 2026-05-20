import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/tailwind.css";
import { App } from "./App";
import { ErrorBoundary } from "./components/shell/ErrorBoundary";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
