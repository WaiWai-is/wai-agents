import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WaiAgentsApi } from '@/lib/api/services';
import type { SessionUser } from '@/lib/state/session-store';
import { AuthView } from '../AuthPlaceholder';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

function createMockApi(
  options: {
    loginResult?: { user: any; tokens: any };
    loginReject?: boolean;
    loginError?: string;
    registerResult?: { user: any; tokens: any };
    registerReject?: boolean;
    registerError?: string;
    magicLinkResult?: { message: string };
    magicLinkReject?: boolean;
    magicLinkError?: string;
    verifyMagicLinkResult?: { user: any; tokens: any };
    verifyMagicLinkReject?: boolean;
    verifyMagicLinkError?: string;
  } = {},
): WaiAgentsApi {
  const defaultUser = {
    id: 'user-1',
    username: 'testuser',
    display_name: 'Test User',
    email: 'test@example.com',
    avatar_url: null,
    bio: null,
  };
  const defaultTokens = {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
  };

  return {
    login: vi.fn().mockImplementation(() => {
      if (options.loginReject)
        return Promise.reject(new Error(options.loginError || 'Login failed'));
      return Promise.resolve(options.loginResult || { user: defaultUser, tokens: defaultTokens });
    }),
    register: vi.fn().mockImplementation(() => {
      if (options.registerReject)
        return Promise.reject(new Error(options.registerError || 'Register failed'));
      return Promise.resolve(
        options.registerResult || { user: defaultUser, tokens: defaultTokens },
      );
    }),
    requestMagicLink: vi.fn().mockImplementation(() => {
      if (options.magicLinkReject)
        return Promise.reject(new Error(options.magicLinkError || 'Magic link failed'));
      return Promise.resolve(options.magicLinkResult || { message: 'Magic link sent' });
    }),
    verifyMagicLink: vi.fn().mockImplementation(() => {
      if (options.verifyMagicLinkReject)
        return Promise.reject(new Error(options.verifyMagicLinkError || 'Verify failed'));
      return Promise.resolve(
        options.verifyMagicLinkResult || { user: defaultUser, tokens: defaultTokens },
      );
    }),
  } as unknown as WaiAgentsApi;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('AuthView', () => {
  let onAuthenticated: ReturnType<typeof vi.fn>;
  let api: WaiAgentsApi;

  beforeEach(() => {
    onAuthenticated = vi.fn();
    api = createMockApi();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  /* ---- Renders ---- */

  it('renders the auth panel', () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    expect(screen.getByLabelText('auth-panel')).toBeInTheDocument();
  });

  it('renders Log In and Register tabs', () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    // "Log In" appears both as a mode tab and submit button
    expect(screen.getAllByText('Log In').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Register')).toBeInTheDocument();
  });

  it('shows login form by default', () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
  });

  it('shows Password and Magic Link method buttons', () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    // "Password" appears as method button and as the label text
    expect(screen.getAllByText('Password').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Magic Link')).toBeInTheDocument();
  });

  /* ---- Login form validation ---- */

  it('has required attribute on email field', () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const emailInput = screen.getByPlaceholderText('you@example.com');
    expect(emailInput).toHaveAttribute('required');
  });

  it('has required attribute on password field', () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const passwordInput = screen.getByPlaceholderText('Enter your password');
    expect(passwordInput).toHaveAttribute('required');
  });

  it('email input has type="email" for browser validation', () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const emailInput = screen.getByPlaceholderText('you@example.com');
    expect(emailInput).toHaveAttribute('type', 'email');
  });

  it('password input has type="password"', () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const passwordInput = screen.getByPlaceholderText('Enter your password');
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('shows login button with correct label', () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    expect(screen.getByText('Log In', { selector: 'button[type="submit"]' })).toBeInTheDocument();
  });

  /* ---- Login submission ---- */

  it('calls api.login with correct credentials', async () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('you@example.com'), 'user@test.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'password123');
    await user.click(screen.getByText('Log In', { selector: 'button[type="submit"]' }));

    await waitFor(() => {
      expect(api.login).toHaveBeenCalledWith({
        email: 'user@test.com',
        password: 'password123',
      });
    });
  });

  it('calls onAuthenticated after successful login', async () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('you@example.com'), 'user@test.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'password123');
    await user.click(screen.getByText('Log In', { selector: 'button[type="submit"]' }));

    await waitFor(() => {
      expect(onAuthenticated).toHaveBeenCalledTimes(1);
    });
  });

  /* ---- Login error display ---- */

  it('displays error message on login failure', async () => {
    const failApi = createMockApi({ loginReject: true, loginError: 'Invalid credentials' });
    render(<AuthView api={failApi} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('you@example.com'), 'user@test.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'wrong');
    await user.click(screen.getByText('Log In', { selector: 'button[type="submit"]' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('does not call onAuthenticated on login failure', async () => {
    const failApi = createMockApi({ loginReject: true });
    render(<AuthView api={failApi} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('you@example.com'), 'user@test.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'wrong');
    await user.click(screen.getByText('Log In', { selector: 'button[type="submit"]' }));

    await waitFor(() => {
      expect(screen.getByText('Login failed')).toBeInTheDocument();
    });
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  /* ---- Loading state ---- */

  it('shows "Logging in..." while login is pending', async () => {
    const slowApi = createMockApi();
    (slowApi.login as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    render(<AuthView api={slowApi} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('you@example.com'), 'user@test.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'password');
    await user.click(screen.getByText('Log In', { selector: 'button[type="submit"]' }));

    await waitFor(() => {
      expect(screen.getByText('Logging in...')).toBeInTheDocument();
    });
  });

  it('disables submit button while login is pending', async () => {
    const slowApi = createMockApi();
    (slowApi.login as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    render(<AuthView api={slowApi} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('you@example.com'), 'user@test.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'password');
    await user.click(screen.getByText('Log In', { selector: 'button[type="submit"]' }));

    await waitFor(() => {
      const btn = screen.getByText('Logging in...');
      expect(btn).toBeDisabled();
    });
  });

  /* ---- Toggle between login and register ---- */

  it('switches to register form when Register tab is clicked', async () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();

    await user.click(screen.getByText('Register'));

    expect(screen.getByPlaceholderText('Your name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Choose a username')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Create a password')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Re-enter your password')).toBeInTheDocument();
  });

  it('switches back to login when Log In tab is clicked', async () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();

    await user.click(screen.getByText('Register'));
    expect(screen.getByPlaceholderText('Your name')).toBeInTheDocument();

    await user.click(screen.getByText('Log In'));
    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Your name')).not.toBeInTheDocument();
  });

  it('clears error when switching modes', async () => {
    const failApi = createMockApi({ loginReject: true, loginError: 'Bad login' });
    render(<AuthView api={failApi} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('you@example.com'), 'user@test.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'wrong');
    await user.click(screen.getByText('Log In', { selector: 'button[type="submit"]' }));

    await waitFor(() => {
      expect(screen.getByText('Bad login')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Register'));
    expect(screen.queryByText('Bad login')).not.toBeInTheDocument();
  });

  /* ---- Registration form ---- */

  it('renders registration form with all fields', async () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Register'));

    expect(screen.getByText('Display Name')).toBeInTheDocument();
    expect(screen.getByText('Username')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Password')).toBeInTheDocument();
    expect(screen.getByText('Confirm Password')).toBeInTheDocument();
  });

  it('shows password strength indicator when typing password', async () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Register'));

    await user.type(screen.getByPlaceholderText('Create a password'), 'abc');

    await waitFor(() => {
      expect(screen.getByText('Very Weak')).toBeInTheDocument();
    });
  });

  it('shows Weak strength for 6-7 char password', async () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Register'));

    await user.type(screen.getByPlaceholderText('Create a password'), 'abcdef');

    await waitFor(() => {
      expect(screen.getByText('Weak')).toBeInTheDocument();
    });
  });

  it('shows Fair strength for 8-11 char password', async () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Register'));

    await user.type(screen.getByPlaceholderText('Create a password'), 'abcdefgh');

    await waitFor(() => {
      expect(screen.getByText('Fair')).toBeInTheDocument();
    });
  });

  it('shows Strong strength for 12+ char password with mixed chars', async () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Register'));

    await user.type(screen.getByPlaceholderText('Create a password'), 'MyP@ssword123');

    await waitFor(() => {
      expect(screen.getByText('Strong')).toBeInTheDocument();
    });
  });

  it('shows mismatch warning when passwords do not match', async () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Register'));

    await user.type(screen.getByPlaceholderText('Create a password'), 'password123');
    await user.type(screen.getByPlaceholderText('Re-enter your password'), 'different');

    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });
  });

  it('does not show mismatch when confirm password is empty', async () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Register'));

    await user.type(screen.getByPlaceholderText('Create a password'), 'password123');
    // Leave confirm empty
    expect(screen.queryByText('Passwords do not match')).not.toBeInTheDocument();
  });

  it('disables Create Account button when form is invalid', async () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Register'));

    // Only fill in display name, leaving other fields empty
    await user.type(screen.getByPlaceholderText('Your name'), 'Test');

    const createBtn = screen.getByText('Create Account');
    expect(createBtn).toBeDisabled();
  });

  it('enables Create Account when all fields are valid', async () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Register'));

    await user.type(screen.getByPlaceholderText('Your name'), 'Test User');
    await user.type(screen.getByPlaceholderText('Choose a username'), 'testuser');
    await user.type(screen.getByPlaceholderText('you@example.com'), 'test@test.com');
    await user.type(screen.getByPlaceholderText('Create a password'), 'password123');
    await user.type(screen.getByPlaceholderText('Re-enter your password'), 'password123');

    const createBtn = screen.getByText('Create Account');
    expect(createBtn).not.toBeDisabled();
  });

  it('calls api.register with correct data on submit', async () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Register'));

    await user.type(screen.getByPlaceholderText('Your name'), 'Test User');
    await user.type(screen.getByPlaceholderText('Choose a username'), 'testuser');
    await user.type(screen.getByPlaceholderText('you@example.com'), 'test@test.com');
    await user.type(screen.getByPlaceholderText('Create a password'), 'password123');
    await user.type(screen.getByPlaceholderText('Re-enter your password'), 'password123');
    await user.click(screen.getByText('Create Account'));

    await waitFor(() => {
      expect(api.register).toHaveBeenCalledWith({
        username: 'testuser',
        email: 'test@test.com',
        password: 'password123',
        display_name: 'Test User',
      });
    });
  });

  it('calls onAuthenticated after successful registration', async () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Register'));

    await user.type(screen.getByPlaceholderText('Your name'), 'Test User');
    await user.type(screen.getByPlaceholderText('Choose a username'), 'testuser');
    await user.type(screen.getByPlaceholderText('you@example.com'), 'test@test.com');
    await user.type(screen.getByPlaceholderText('Create a password'), 'password123');
    await user.type(screen.getByPlaceholderText('Re-enter your password'), 'password123');
    await user.click(screen.getByText('Create Account'));

    await waitFor(() => {
      expect(onAuthenticated).toHaveBeenCalledTimes(1);
    });
  });

  it('shows error on registration failure', async () => {
    const failApi = createMockApi({ registerReject: true, registerError: 'Username taken' });
    render(<AuthView api={failApi} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Register'));

    await user.type(screen.getByPlaceholderText('Your name'), 'Test');
    await user.type(screen.getByPlaceholderText('Choose a username'), 'taken');
    await user.type(screen.getByPlaceholderText('you@example.com'), 'test@test.com');
    await user.type(screen.getByPlaceholderText('Create a password'), 'password123');
    await user.type(screen.getByPlaceholderText('Re-enter your password'), 'password123');
    await user.click(screen.getByText('Create Account'));

    await waitFor(() => {
      expect(screen.getByText('Username taken')).toBeInTheDocument();
    });
  });

  it('shows "Creating account..." while registration is pending', async () => {
    const slowApi = createMockApi();
    (slowApi.register as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    render(<AuthView api={slowApi} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Register'));

    await user.type(screen.getByPlaceholderText('Your name'), 'Test User');
    await user.type(screen.getByPlaceholderText('Choose a username'), 'testuser');
    await user.type(screen.getByPlaceholderText('you@example.com'), 'test@test.com');
    await user.type(screen.getByPlaceholderText('Create a password'), 'password123');
    await user.type(screen.getByPlaceholderText('Re-enter your password'), 'password123');
    await user.click(screen.getByText('Create Account'));

    await waitFor(() => {
      expect(screen.getByText('Creating account...')).toBeInTheDocument();
    });
  });

  /* ---- Magic link flow ---- */

  it('switches to magic link form when Magic Link button is clicked', async () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Magic Link'));

    expect(screen.getByText('Send Magic Link')).toBeInTheDocument();
  });

  it('shows "Sending..." while magic link request is pending', async () => {
    const slowApi = createMockApi();
    (slowApi.requestMagicLink as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    render(<AuthView api={slowApi} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Magic Link'));

    await user.type(screen.getByPlaceholderText('you@example.com'), 'user@test.com');
    await user.click(screen.getByText('Send Magic Link'));

    await waitFor(() => {
      expect(screen.getByText('Sending...')).toBeInTheDocument();
    });
  });

  it('shows token verification form after sending magic link', async () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Magic Link'));

    await user.type(screen.getByPlaceholderText('you@example.com'), 'user@test.com');
    await user.click(screen.getByText('Send Magic Link'));

    await waitFor(() => {
      expect(screen.getByText('Check your email!')).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText('Paste token from email')).toBeInTheDocument();
  });

  it('shows email address in magic link confirmation', async () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Magic Link'));

    await user.type(screen.getByPlaceholderText('you@example.com'), 'magic@test.com');
    await user.click(screen.getByText('Send Magic Link'));

    await waitFor(() => {
      expect(screen.getByText('magic@test.com')).toBeInTheDocument();
    });
  });

  it('verifies magic link token successfully', async () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Magic Link'));

    await user.type(screen.getByPlaceholderText('you@example.com'), 'user@test.com');
    await user.click(screen.getByText('Send Magic Link'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste token from email')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Paste token from email'), 'valid-token-123');
    await user.click(screen.getByText('Verify Token'));

    await waitFor(() => {
      expect(api.verifyMagicLink).toHaveBeenCalledWith('valid-token-123');
      expect(onAuthenticated).toHaveBeenCalledTimes(1);
    });
  });

  it('shows error when magic link verification fails', async () => {
    const failApi = createMockApi({
      verifyMagicLinkReject: true,
      verifyMagicLinkError: 'Token expired',
    });
    render(<AuthView api={failApi} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Magic Link'));

    await user.type(screen.getByPlaceholderText('you@example.com'), 'user@test.com');
    await user.click(screen.getByText('Send Magic Link'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste token from email')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Paste token from email'), 'expired-token');
    await user.click(screen.getByText('Verify Token'));

    await waitFor(() => {
      expect(screen.getByText('Token expired')).toBeInTheDocument();
    });
  });

  it('disables Verify Token button when token input is empty', async () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Magic Link'));

    await user.type(screen.getByPlaceholderText('you@example.com'), 'user@test.com');
    await user.click(screen.getByText('Send Magic Link'));

    await waitFor(() => {
      const verifyBtn = screen.getByText('Verify Token');
      expect(verifyBtn).toBeDisabled();
    });
  });

  it('shows "Use a different email" link in verify step', async () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Magic Link'));

    await user.type(screen.getByPlaceholderText('you@example.com'), 'user@test.com');
    await user.click(screen.getByText('Send Magic Link'));

    await waitFor(() => {
      expect(screen.getByText('Use a different email')).toBeInTheDocument();
    });
  });

  it('goes back to request step when "Use a different email" is clicked', async () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Magic Link'));

    await user.type(screen.getByPlaceholderText('you@example.com'), 'user@test.com');
    await user.click(screen.getByText('Send Magic Link'));

    await waitFor(() => {
      expect(screen.getByText('Use a different email')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Use a different email'));
    expect(screen.getByText('Send Magic Link')).toBeInTheDocument();
  });

  it('shows magic link request error', async () => {
    const failApi = createMockApi({ magicLinkReject: true, magicLinkError: 'Rate limited' });
    render(<AuthView api={failApi} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Magic Link'));

    await user.type(screen.getByPlaceholderText('you@example.com'), 'user@test.com');
    await user.click(screen.getByText('Send Magic Link'));

    await waitFor(() => {
      expect(screen.getByText('Rate limited')).toBeInTheDocument();
    });
  });

  /* ---- Method switching ---- */

  it('clears error when switching login method', async () => {
    const failApi = createMockApi({ loginReject: true, loginError: 'Bad login' });
    render(<AuthView api={failApi} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('you@example.com'), 'user@test.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'wrong');
    await user.click(screen.getByText('Log In', { selector: 'button[type="submit"]' }));

    await waitFor(() => {
      expect(screen.getByText('Bad login')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Magic Link'));
    expect(screen.queryByText('Bad login')).not.toBeInTheDocument();
  });

  it('switches back to password method from magic link', async () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();

    await user.click(screen.getByText('Magic Link'));
    expect(screen.getByText('Send Magic Link')).toBeInTheDocument();

    await user.click(screen.getByText('Password'));
    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
  });

  /* ---- autocomplete attributes ---- */

  it('has correct autocomplete attributes on login form', () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    expect(screen.getByPlaceholderText('you@example.com')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByPlaceholderText('Enter your password')).toHaveAttribute(
      'autocomplete',
      'current-password',
    );
  });

  it('has correct autocomplete attributes on register form', async () => {
    render(<AuthView api={api} onAuthenticated={onAuthenticated} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Register'));

    expect(screen.getByPlaceholderText('Your name')).toHaveAttribute('autocomplete', 'name');
    expect(screen.getByPlaceholderText('Choose a username')).toHaveAttribute(
      'autocomplete',
      'username',
    );
    expect(screen.getByPlaceholderText('Create a password')).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
    expect(screen.getByPlaceholderText('Re-enter your password')).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
  });
});
