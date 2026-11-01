import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Site from "./Site.jsx";

createRoot(document.getElementById("root")).render(<StrictMode><Site /></StrictMode>);
