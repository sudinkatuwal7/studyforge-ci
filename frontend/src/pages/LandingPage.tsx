import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import SiteHeader from "../components/auth/SiteHeader";
import Panda from "../components/shared/Panda";
import "../styles/auth.css";
import "../styles/landing.css";

const FEATURES = [
  {
    title: "Ask Pandu",
    text: "Chat with Pandu, your study assistant, about the materials you choose from a course.",
  },
  {
    title: "Notes from your materials",
    text: "Turn lecture slides, readings and other uploads into study notes.",
  },
  {
    title: "Practice quizzes",
    text: "Generate quizzes from your course materials, take them, and see your score.",
  },
  {
    title: "Course management",
    text: "Keep your courses, materials, tasks and study sessions in one place.",
  },
];

type LandingPageProps = {
  // Small print under the page, such as the backend health line.
  footer?: ReactNode;
};

// Public page at the site root for signed-out visitors.
export default function LandingPage({ footer }: LandingPageProps) {
  const { hash, key } = useLocation();

  // The browser only scrolls to a #section on a full page load. The header's
  // Features link changes the address inside the app, so scroll here. The key
  // changes on every click, so clicking Features again scrolls again.
  useEffect(() => {
    if (!hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [hash, key]);

  return (
    <div className="auth-page landing-page">
      <SiteHeader />

      <main className="landing-main">
        <section className="landing-hero" aria-labelledby="landing-title">
          <Panda className="panda landing-panda" />
          <h1 id="landing-title" className="auth-hero-title">
            Study smarter with StudyForge
          </h1>
          <p className="auth-hero-text landing-lead">
            Upload your course materials, then turn them into notes and quizzes, or ask
            Pandu about them, all in one study space.
          </p>
          <div className="landing-actions">
            <Link to="/register" className="auth-pill auth-pill-dark">
              Start free
            </Link>
            <Link to="/login" className="auth-pill">
              Log in
            </Link>
          </div>
        </section>

        <section id="features" className="landing-features" aria-labelledby="features-title">
          <h2 id="features-title">Everything for your courses</h2>
          <ul className="landing-feature-list">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="landing-feature">
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="landing-cta" aria-labelledby="cta-title">
          <h2 id="cta-title">Ready to start studying?</h2>
          <p>Create a free account, or log in to pick up where you left off.</p>
          <div className="landing-actions">
            <Link to="/register" className="auth-pill auth-pill-dark">
              Create a free account
            </Link>
            <Link to="/login" className="auth-pill">
              Log in
            </Link>
          </div>
        </section>
      </main>

      {footer && <footer className="auth-footer">{footer}</footer>}
    </div>
  );
}
