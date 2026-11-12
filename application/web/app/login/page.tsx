import type { Metadata } from "next";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Sign in | Mavic",
  description: "Sign in to the Mavic operations workspace.",
};

export default function LoginPage() {
  return (
    <main className="login-layout">
      <section aria-label="Mavic workspace" className="login-photo-panel">
        <div className="login-brand-lockup">
          <span aria-hidden="true" className="login-brand-mark">
            M
          </span>
          <span className="login-brand-name">MAVIC DEVELOPMENT INC.</span>
        </div>
        <div className="login-photo-caption">
          <h1>Welcome to a better way to work.</h1>
        </div>
      </section>

      <section aria-labelledby="login-title" className="login-form-panel">
        <div className="login-form-wrap">
          <div className="login-mobile-brand">
            <span aria-hidden="true" className="login-brand-mark">
              M
            </span>
            <span className="login-brand-name">MAVIC</span>
          </div>
          <h2 id="login-title">Sign in to your account</h2>
          <p className="login-intro">
            Use your work credentials to access your Mavic branch workspace.
          </p>

          <LoginForm />

          <div className="login-security-note">
            {/* <span aria-hidden="true" className="security-mark" />
            <p>
              Sessions are protected by an HttpOnly cookie. Passwords are not
              saved in this browser.
            </p> */}
          </div>
        </div>
      </section>
    </main>
  );
}
