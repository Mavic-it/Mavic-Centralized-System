import Link from 'next/link';
import ForgotPasswordForm from './request-form';

export default function ForgotPasswordPage() {
  return (
    <main className="login-layout">
      <section aria-label="Mavic account access" className="login-photo-panel">
        <div className="login-brand-lockup"><span className="login-brand-mark">M</span><span className="login-brand-name">MAVIC</span></div>
        <div className="login-photo-caption"><p>ACCOUNT SECURITY</p><h1>Secure access for every Mavic account.</h1></div>
      </section>
      <section className="login-form-panel forgot-password-panel">
        <div className="login-form-wrap forgot-password-wrap">
          <Link href="/login" className="password-back-link forgot-password-back"><span aria-hidden="true">←</span> Back to sign in</Link>
          <p className="eyebrow">ACCOUNT ACCESS</p>
          <h1>Forgot password?</h1>
          <p className="forgot-password-intro">Send a recovery request to your workspace administrators. We will not reveal whether an account matches these details.</p>
          <ForgotPasswordForm />
        </div>
      </section>
    </main>
  );
}
