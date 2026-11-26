import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { DEFAULT_CONFIG } from "./core/leach";
import "./style.css";

// Uruchomienie aplikacji z domyślnymi parametrami sieci
const root = document.getElementById("root");
if (root !== null)
  createRoot(root).render(
    <StrictMode>
      <App config={DEFAULT_CONFIG} />
    </StrictMode>,
  );
