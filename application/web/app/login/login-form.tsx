"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { AuthClientError, login } from "@/lib/auth/auth-client";
import {
  loginCredentialsSchema,
  type LoginCredentials,
} from "@/lib/auth/login-schema";
import { isSafeReturnUrl } from "@/lib/route-access";
import { destinationForRole } from "@/app/lib/workspace-access";
import { notifyError } from "@/app/lib/notifications";
import { IconActionButton } from "../components/icon-action-button";
import { RequiredMark } from "../components/required-mark";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("password") && !url.searchParams.has("email"))
      return;
    url.searchParams.delete("password");
    url.searchParams.delete("email");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);
  const safeReturnUrl = isSafeReturnUrl(searchParams.get("returnUrl"));
  const [passwordVisible, setPasswordVisible] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginCredentials>({
    resolver: zodResolver(loginCredentialsSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(credentials: LoginCredentials) {
    try {
      const session = await login(credentials);
      router.replace(
        session.mustChangePassword
          ? "/me/security"
          : destinationForRole(session.role, safeReturnUrl),
      );
      router.refresh();
    } catch (error) {
      notifyError(
        error instanceof AuthClientError
          ? error.message
          : "Sign-in failed. Please try again.",
      );
    }
  }

  return (
    <form className="login-form" noValidate onSubmit={handleSubmit(onSubmit)}>
      <div className="login-field">
        <label htmlFor="email">
          Work email
          <RequiredMark />
        </label>
        <div
          className={`login-input-wrap${errors.email ? " input-invalid" : ""}`}
        >
          <Mail aria-hidden="true" className="login-input-icon" size={17} />
          <input
            autoComplete="username"
            autoCapitalize="none"
            aria-describedby={errors.email ? "email-error" : undefined}
            aria-invalid={Boolean(errors.email)}
            id="email"
            inputMode="email"
            maxLength={254}
            placeholder="name@company.com"
            type="email"
            required
            {...register("email")}
          />
        </div>
        {errors.email && (
          <p className="field-error" id="email-error">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="login-field">
        <div className="login-label-row">
          <label htmlFor="password">
            Password
            <RequiredMark />
          </label>
          <Link className="password-help" href="/forgot-password">
            Forgot password?
          </Link>
        </div>
        <div
          className={`login-input-wrap${errors.password ? " input-invalid" : ""}`}
        >
          <LockKeyhole
            aria-hidden="true"
            className="login-input-icon"
            size={17}
          />
          <input
            autoComplete="current-password"
            aria-describedby={errors.password ? "password-error" : undefined}
            aria-invalid={Boolean(errors.password)}
            id="password"
            required
            maxLength={256}
            placeholder="Enter your password"
            type={passwordVisible ? "text" : "password"}
            {...register("password")}
          />
          <IconActionButton
            className="password-toggle"
            icon={passwordVisible ? EyeOff : Eye}
            label={passwordVisible ? "Hide password" : "Show password"}
            onClick={() => setPasswordVisible((visible) => !visible)}
          />
        </div>
        {errors.password && (
          <p className="field-error" id="password-error">
            {errors.password.message}
          </p>
        )}
      </div>

      <button
        aria-busy={isSubmitting}
        className="login-submit"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? (
          <>
            <LoaderCircle
              aria-hidden="true"
              className="login-spinner"
              size={17}
            />
            Signing in
          </>
        ) : (
          <>
            Sign in <span aria-hidden="true">→</span>
          </>
        )}
      </button>
    </form>
  );
}
