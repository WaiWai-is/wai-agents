"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { createWaiAgentsApi } from "@/lib/api";
import { useSessionStore } from "@/lib/state";
import type { SessionUser } from "@/lib/state/session-store";
import { AuthView } from "@/features/auth";
import { SettingsView } from "@/features/settings";

const ChatView = dynamic(
  () => import("@/features/chat").then((m) => ({ default: m.ChatView })),
  { loading: () => <div className="view-loading">Loading...</div> }
);

const AgentBuilderView = dynamic(
  () => import("@/features/agent-builder").then((m) => ({ default: m.AgentBuilderView })),
  { loading: () => <div className="view-loading">Loading...</div> }
);

const FeedView = dynamic(
  () => import("@/features/feed").then((m) => ({ default: m.FeedView })),
  { loading: () => <div className="view-loading">Loading...</div> }
);

const MarketplaceView = dynamic(
  () => import("@/features/marketplace").then((m) => ({ default: m.MarketplaceView })),
  { loading: () => <div className="view-loading">Loading...</div> }
);

const PagesView = dynamic(
  () => import("@/features/pages").then((m) => ({ default: m.PagesView })),
  { loading: () => <div className="view-loading">Loading...</div> }
);

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("UI Error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div style={{ padding: 40, textAlign: "center" }}>
            <h2>Something went wrong</h2>
            <button onClick={() => this.setState({ hasError: false })}>
              Try again
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

type Tab = "chats" | "agents" | "feed" | "pages" | "marketplace" | "settings";

const TABS: Array<{ key: Tab; label: string; icon: string }> = [
  { key: "chats", label: "Chats", icon: "💬" },
  { key: "agents", label: "Agents", icon: "🤖" },
  { key: "feed", label: "Feed", icon: "📡" },
  { key: "pages", label: "Pages", icon: "📄" },
  { key: "marketplace", label: "Marketplace", icon: "🏪" },
  { key: "settings", label: "Settings", icon: "⚙️" },
];

export default function HomePage() {
  const api = useMemo(
    () => createWaiAgentsApi(() => useSessionStore.getState().accessToken),
    []
  );

  const {
    hydrated,
    isAuthenticated,
    accessToken,
    refreshToken,
    user,
    setSession,
    clearSession,
  } = useSessionStore((state) => ({
    hydrated: state.hydrated,
    isAuthenticated: state.isAuthenticated,
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    user: state.user,
    setSession: state.setSession,
    clearSession: state.clearSession,
  }));

  const [activeTab, setActiveTab] = useState<Tab>("chats");
  const [focusConversationId, setFocusConversationId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Restore session on mount
  useEffect(() => {
    if (!hydrated || !isAuthenticated || !accessToken) return;

    void api
      .me()
      .then((response) => {
        const nextUser = toSessionUser(response.user);
        setSession({
          accessToken,
          refreshToken: refreshToken ?? undefined,
          user: nextUser,
        });
      })
      .catch(() => {
        clearSession();
      });
  }, [accessToken, api, clearSession, hydrated, isAuthenticated, refreshToken, setSession]);

  // Auto-clear status message
  useEffect(() => {
    if (!statusMessage) return;
    const t = setTimeout(() => setStatusMessage(null), 4000);
    return () => clearTimeout(t);
  }, [statusMessage]);

  const onLogout = useCallback(async () => {
    if (refreshToken) {
      try {
        await api.logout(refreshToken);
      } catch {
        // local session will still be cleared
      }
    }
    clearSession();
    setStatusMessage("Logged out.");
  }, [api, clearSession, refreshToken]);

  const handleStartAgentConversation = useCallback((conversationId: string) => {
    setFocusConversationId(conversationId);
    setActiveTab("chats");
  }, []);

  // Loading state
  if (!hydrated) {
    return (
      <main className="app-shell loading-shell" aria-label="loading-shell">
        <div className="loading-spinner-container">
          <div className="loading-spinner" />
          <p className="loading-text">Restoring session...</p>
        </div>
      </main>
    );
  }

  // Auth state
  if (!isAuthenticated || !accessToken || !user) {
    return (
      <main className="app-shell auth-shell">
        <div className="auth-branding">
          <div className="auth-logo">🦝</div>
          <h1 className="auth-title">WaiAgents</h1>
          <p className="auth-subtitle">
            Messaging, AI agents, and pages — all in one place.
          </p>
        </div>

        <AuthView
          api={api}
          onAuthenticated={({ user: nextUser, tokens }) => {
            setSession({
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              user: nextUser,
            });
            setStatusMessage(`Signed in as @${nextUser.username}`);
          }}
        />

        {statusMessage && <p className="info-banner">{statusMessage}</p>}
      </main>
    );
  }

  // Main app
  return (
    <div className="app-layout" aria-label="web-app-shell">
      {/* Sidebar Navigation */}
      <nav className="app-sidebar" aria-label="primary-navigation">
        <div className="sidebar-brand">
          <span className="brand-icon">🦝</span>
          <span className="brand-name">WaiAgents</span>
        </div>

        <div className="sidebar-nav">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`sidebar-nav-item ${activeTab === tab.key ? "active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
              title={tab.label}
            >
              <span className="nav-icon">{tab.icon}</span>
              <span className="nav-label">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-user">
          <div className="avatar avatar-sm">
            {getInitials(user.display_name || user.username)}
          </div>
          <span className="sidebar-username">
            {user.display_name || user.username}
          </span>
        </div>
      </nav>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-nav" aria-label="mobile-navigation">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`mobile-nav-item ${activeTab === tab.key ? "active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="nav-icon">{tab.icon}</span>
            <span className="nav-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <main className="app-main">
        {activeTab === "chats" && (
          <ErrorBoundary>
            <ChatView
              api={api}
              accessToken={accessToken}
              currentUser={user}
              focusConversationId={focusConversationId}
              onConversationFocused={() => {
                if (focusConversationId) setFocusConversationId(null);
              }}
            />
          </ErrorBoundary>
        )}

        {activeTab === "agents" && (
          <ErrorBoundary>
            <AgentBuilderView api={api} accessToken={accessToken} currentUser={user} />
          </ErrorBoundary>
        )}

        {activeTab === "feed" && (
          <ErrorBoundary>
            <FeedView api={api} currentUser={user} />
          </ErrorBoundary>
        )}

        {activeTab === "pages" && (
          <ErrorBoundary>
            <PagesView api={api} currentUser={user} />
          </ErrorBoundary>
        )}

        {activeTab === "marketplace" && (
          <ErrorBoundary>
            <MarketplaceView
              api={api}
              currentUser={user}
              onOpenConversation={handleStartAgentConversation}
            />
          </ErrorBoundary>
        )}

        {activeTab === "settings" && (
          <ErrorBoundary>
            <SettingsView
              api={api}
              user={user}
              onUserUpdated={(nextUser) => {
                setSession({
                  accessToken,
                  refreshToken: refreshToken ?? undefined,
                  user: nextUser,
                });
              }}
              onLogout={() => void onLogout()}
            />
          </ErrorBoundary>
        )}
      </main>

      {/* Status Toast */}
      {statusMessage && (
        <div className="toast-container">
          <div className="toast info-banner">{statusMessage}</div>
        </div>
      )}
    </div>
  );
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
    bio: user.bio,
  };
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
