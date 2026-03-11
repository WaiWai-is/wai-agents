"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createWaiAgentsApi } from "@/lib/api";
import { useSessionStore } from "@/lib/state";
import type { SessionUser } from "@/lib/state/session-store";

type VerifyState = "verifying" | "success" | "error";

export function MagicLinkVerifyClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tokenRaw = searchParams.get("token") ?? "";
  const token = sanitizeToken(tokenRaw);
  const appDeepLink = token ? `waiagents://auth/magic-link/verify?token=${encodeURIComponent(token)}` : "";

  const setSession = useSessionStore((state) => state.setSession);
  const api = useMemo(() => createWaiAgentsApi(), []);

  const [state, setState] = useState<VerifyState>("verifying");
  const [message, setMessage] = useState("Verifying your magic link...");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("Missing token in magic link.");
      return;
    }

    let cancelled = false;

    void api
      .verifyMagicLink(token)
      .then((response) => {
        if (cancelled) {
          return;
        }

        setSession({
          accessToken: response.tokens.access_token,
          refreshToken: response.tokens.refresh_token,
          user: toSessionUser(response.user)
        });

        setState("success");
        setMessage(`Signed in as @${response.user.username}. Redirecting...`);

        setTimeout(() => {
          if (!cancelled) {
            router.replace("/");
          }
        }, 1200);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setState("error");
        setMessage(getErrorMessage(error));
      });

    return () => {
      cancelled = true;
    };
  }, [api, router, setSession, token]);

  return (
    <main className="app-shell auth-shell">
      <section className="auth-card" aria-label="magic-link-verify-page">
        <header className="panel-header">
          <h2>Magic Link Verification</h2>
          <p>{message}</p>
        </header>

        {state === "verifying" && <p className="info-banner">Please wait…</p>}
        {state === "success" && <p className="info-banner">Success</p>}
        {state === "error" && <p className="error-banner">{message}</p>}

        <div className="inline-buttons">
          <Link href="/" className="link-button">
            Back to login
          </Link>
          {token && (
            <a href={appDeepLink} className="link-button">
              Open in app
            </a>
          )}
        </div>
      </section>
    </main>
  );
}

function sanitizeToken(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

function toSessionUser(user: {
  id: string;
  username: string;
  display_name: string | null;
  email?: string;
  avatar_url: string | null;
  bio: string | null;
}): SessionUser {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    email: user.email,
    avatar_url: user.avatar_url,
    bio: user.bio
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Token is invalid or expired";
}
