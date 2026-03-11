import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '../session-store';

// Reset the zustand store between tests to avoid state leakage
function resetStore() {
  useSessionStore.setState({
    accessToken: undefined,
    refreshToken: undefined,
    user: undefined,
    isAuthenticated: false,
    hydrated: false,
  });
}

describe('useSessionStore', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    resetStore();
  });

  it('starts with unauthenticated state', () => {
    const state = useSessionStore.getState();

    expect(state.isAuthenticated).toBe(false);
    expect(state.accessToken).toBeUndefined();
    expect(state.refreshToken).toBeUndefined();
    expect(state.user).toBeUndefined();
  });

  describe('setSession', () => {
    it('sets tokens and marks authenticated', () => {
      const { setSession } = useSessionStore.getState();

      setSession({
        accessToken: 'tok_abc',
        refreshToken: 'ref_xyz',
        user: {
          id: 'u1',
          username: 'alice',
          display_name: 'Alice',
          email: 'alice@test.com',
          avatar_url: null,
          bio: null,
        },
      });

      const state = useSessionStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.accessToken).toBe('tok_abc');
      expect(state.refreshToken).toBe('ref_xyz');
      expect(state.user?.username).toBe('alice');
    });

    it('preserves existing refreshToken when not provided', () => {
      const { setSession } = useSessionStore.getState();

      // First call sets a refresh token
      setSession({ accessToken: 'tok1', refreshToken: 'ref1' });

      // Second call omits refreshToken
      setSession({ accessToken: 'tok2' });

      const state = useSessionStore.getState();
      expect(state.accessToken).toBe('tok2');
      expect(state.refreshToken).toBe('ref1');
    });

    it('updates user on subsequent calls', () => {
      const { setSession } = useSessionStore.getState();

      setSession({
        accessToken: 'tok1',
        user: {
          id: 'u1',
          username: 'v1',
          display_name: null,
          avatar_url: null,
          bio: null,
        },
      });

      setSession({
        accessToken: 'tok2',
        user: {
          id: 'u1',
          username: 'v2',
          display_name: 'Updated',
          avatar_url: 'https://cdn.com/new.png',
          bio: 'New bio',
        },
      });

      const state = useSessionStore.getState();
      expect(state.user?.username).toBe('v2');
      expect(state.user?.display_name).toBe('Updated');
    });
  });

  describe('clearSession', () => {
    it('resets all session data', () => {
      const { setSession, clearSession } = useSessionStore.getState();

      setSession({
        accessToken: 'tok',
        refreshToken: 'ref',
        user: {
          id: 'u1',
          username: 'alice',
          display_name: null,
          avatar_url: null,
          bio: null,
        },
      });

      clearSession();

      const state = useSessionStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.accessToken).toBeUndefined();
      expect(state.refreshToken).toBeUndefined();
      expect(state.user).toBeUndefined();
    });

    it('preserves hydrated=true after clearing', () => {
      const { setSession, clearSession } = useSessionStore.getState();

      setSession({ accessToken: 'tok' });
      clearSession();

      const state = useSessionStore.getState();
      expect(state.hydrated).toBe(true);
    });
  });

  describe('setHydrated', () => {
    it('sets hydrated to true', () => {
      const { setHydrated } = useSessionStore.getState();

      expect(useSessionStore.getState().hydrated).toBe(false);

      setHydrated();

      expect(useSessionStore.getState().hydrated).toBe(true);
    });
  });

  describe('subscribe', () => {
    it('notifies subscribers on state change', () => {
      const listener = vi.fn();
      const unsubscribe = useSessionStore.subscribe(listener);

      useSessionStore.getState().setSession({ accessToken: 'tok' });

      expect(listener).toHaveBeenCalled();
      unsubscribe();
    });
  });
});
