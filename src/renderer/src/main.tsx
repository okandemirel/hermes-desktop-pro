import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource/instrument-serif";
import App from "./App";
import "./styles/global.css";
import { applyAppearancePreferences } from "./themePreferences";

applyAppearancePreferences();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
