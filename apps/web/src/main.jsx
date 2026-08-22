import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/noto-sans-kr";
import "maplibre-gl/dist/maplibre-gl.css";
import { App } from "./App.jsx";
import "./fonts.css";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
