import { Link, NavLink } from "react-router-dom";
import BrandMark from "../shared/BrandMark";
import { ChevronDownIcon } from "./icons";
import "../../styles/auth.css";

// Placeholder site links until their pages exist.
const COMING_SOON_LINKS = ["For Teams", "About"];

// Header of every signed-out page: brand, site links, and the log in and sign up links.
export default function SiteHeader() {
  return (
    <header className="auth-header">
      <div className="auth-brand">
        <span className="auth-logo">
          <BrandMark />
        </span>
        <span className="auth-wordmark">StudyForge</span>
      </div>

      <nav className="auth-nav" aria-label="Site">
        {/* The landing page scrolls to this section; see LandingPage. */}
        <Link to={{ pathname: "/", hash: "features" }} className="auth-nav-item">
          Features
        </Link>
        {COMING_SOON_LINKS.map((link) => (
          <button key={link} type="button" className="auth-nav-item" disabled title="Coming soon">
            {link}
            <ChevronDownIcon />
          </button>
        ))}
      </nav>

      {/* NavLink marks the current page with aria-current="page". */}
      <div className="auth-header-actions">
        <NavLink to="/login" className="auth-pill">
          Log in
        </NavLink>
        <NavLink to="/register" className="auth-pill auth-pill-dark">
          Start free
        </NavLink>
      </div>
    </header>
  );
}
