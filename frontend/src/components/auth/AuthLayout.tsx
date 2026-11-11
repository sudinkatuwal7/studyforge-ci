import type { ReactNode } from "react";
import Panda from "../shared/Panda";
import SiteHeader from "./SiteHeader";
import "../../styles/auth.css";

type AuthLayoutProps = {
  heroTitle: string;
  heroText: string;
  // Small print under the page, such as the backend health line.
  footer?: ReactNode;
  children: ReactNode;
};

// Log in and sign up pages: site header, welcome text on the left, form card on the right.
export default function AuthLayout({
  heroTitle,
  heroText,
  footer,
  children,
}: AuthLayoutProps) {
  return (
    <div className="auth-page">
      <SiteHeader />

      <main className="auth-main">
        <div className="auth-hero">
          <Panda className="panda auth-panda" />
          <h1 className="auth-hero-title">{heroTitle}</h1>
          <p className="auth-hero-text">{heroText}</p>
        </div>
        <div className="auth-panel">{children}</div>
      </main>

      {footer && <footer className="auth-footer">{footer}</footer>}
    </div>
  );
}
