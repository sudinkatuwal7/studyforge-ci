import type { ReactNode } from "react";
import BrandMark from "../shared/BrandMark";
import Panda from "../shared/Panda";
import { ChevronDownIcon } from "./icons";
import "../../styles/auth.css";

type AuthLayoutProps = {
  heroTitle: string;
  heroText: string;
  // Buttons on the right of the header, such as "Log in" and "Start free".
  headerActions?: ReactNode;
  // Small print under the page, such as the backend health line.
  footer?: ReactNode;
  children: ReactNode;
};

// Placeholder site links until marketing pages exist.
const COMING_SOON_LINKS = ["Features", "For Teams", "About"];

// Shared signed-out page: brand header, welcome text on the left, form card on the right.
export default function AuthLayout({
  heroTitle,
  heroText,
  headerActions,
  footer,
  children,
}: AuthLayoutProps) {
  return (
    <div className="auth-page">
      <header className="auth-header">
        <div className="auth-brand">
          <span className="auth-logo">
            <BrandMark />
          </span>
          <span className="auth-wordmark">StudyForge</span>
        </div>

        <nav className="auth-nav" aria-label="Site">
          {COMING_SOON_LINKS.map((link) => (
            <button key={link} type="button" className="auth-nav-item" disabled title="Coming soon">
              {link}
              <ChevronDownIcon />
            </button>
          ))}
        </nav>

        {headerActions && <div className="auth-header-actions">{headerActions}</div>}
      </header>

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
