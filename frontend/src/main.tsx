import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import  { AuthProvider } from "./context/AuthContext.tsx";
import App from "./App.tsx";
import "./styles/index.css";


// AuthProvider shares the login state; BrowserRouter enables links and page routes.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
