import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./context/AuthContext";

// Separate Vite development entry. The production app still starts at index.html.
if (import.meta.env.DEV) {
  void import("./pages/DocumentUploadPreview").then(({ default: Preview }) => {
    createRoot(document.getElementById("root")!).render(
      <StrictMode><AuthProvider><Preview /></AuthProvider></StrictMode>,
    );
  });
}
