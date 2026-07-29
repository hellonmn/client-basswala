import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi, tokenStorage, onSessionExpired } from '../services/userApi';
import { firebaseAuth } from '../services/firebase';

interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: string;
  profilePicture?: string;
  locationCity?: string;
  isVerified: boolean;
  isActive: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  needsProfileCompletion: boolean;
  /** Legacy email+password — left in place for any old client. UI no longer exposes it. */
  login: (email: string, password: string) => Promise<void>;
  /** Phone+OTP login. Pass the `{token, user}` returned by /auth/otp/login. */
  loginWithOtp: (token: string, user: User) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithApple: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  /** Tracks the last sign-in provider so we know when NOT to re-ask for data
   *  already provided by the identity framework (e.g. name/email from Apple). */
  const [lastProvider, setLastProvider] = useState<'apple' | 'google' | 'otp' | null>(null);

  useEffect(() => { checkAuthStatus(); }, []);

  useEffect(() => {
    onSessionExpired(() => setUser(null));
    return () => onSessionExpired(null);
  }, []);

  const checkAuthStatus = async () => {
    try {
      // If we're returning from a Google redirect on mobile web, pick up the token
      try {
        const googleIdToken = await firebaseAuth.consumeRedirectResult();
        if (googleIdToken) {
          const res = await authApi.firebaseLogin(googleIdToken, 'user');
          if (res.success) {
            await tokenStorage.save(res.token);
            await tokenStorage.saveUser(res.user);
            setUser(res.user);
            setIsLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn('Google redirect login error:', err);
      }

      const token = await tokenStorage.get();
      if (token) {
        const cached = await tokenStorage.getUser();
        if (cached) setUser(cached);
        const res = await authApi.getMe();
        if (res.success && res.data) {
          setUser(res.data);
          await tokenStorage.saveUser(res.data);
        }
      }
    } catch {
      await tokenStorage.clearAll();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Email + password login ───────────────────────────────────────────────
  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    if (!res.success) throw new Error(res.message || 'Login failed');
    await tokenStorage.save(res.token);
    await tokenStorage.saveUser(res.user);
    setUser(res.user);
  };

  // ── Phone + OTP login (token already returned from /auth/otp/login) ───────
  const loginWithOtp = async (token: string, freshUser: User) => {
    await tokenStorage.save(token);
    await tokenStorage.saveUser(freshUser);
    setUser(freshUser);
  };

  // ── Google sign-in (web popup or native picker) ──────────────────────────
  const loginWithGoogle = async () => {
    const idToken = await firebaseAuth.signInWithGoogle();
    const res = await authApi.firebaseLogin(idToken, 'user');
    if (!res.success) throw new Error(res.message || 'Google login failed');
    await tokenStorage.save(res.token);
    await tokenStorage.saveUser(res.user);
    setUser(res.user);
  };

  // ── Sign in with Apple (iOS only) ────────────────────────────────────────
  const loginWithApple = async () => {
    const { firebaseIdToken, appleFirstName, appleLastName, appleEmail } =
      await firebaseAuth.signInWithApple();
    // Pass Apple-provided name/email to the backend so it can persist them
    // on first sign-in. On subsequent logins these will be null and the
    // backend will simply keep the values it already stored — this is
    // correct behaviour and satisfies Apple Guideline 4.
    const res = await authApi.firebaseLogin(firebaseIdToken, 'user', {
      firstName: appleFirstName ?? undefined,
      lastName: appleLastName ?? undefined,
      email: appleEmail ?? undefined,
    });
    if (!res.success) throw new Error(res.message || 'Apple login failed');
    await tokenStorage.save(res.token);
    await tokenStorage.saveUser(res.user);
    // Track that this session was authenticated via Apple so needsProfileCompletion
    // never prompts for name/email (Apple already provided those).
    setLastProvider('apple');
    setUser(res.user);
  };

  const logout = async () => {
    try { await firebaseAuth.signOut(); } catch {}
    await tokenStorage.clearAll();
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const res = await authApi.getMe();
      if (res.success && res.data) {
        setUser(res.data);
        await tokenStorage.saveUser(res.data);
      }
    } catch { /* silent */ }
  };

  const isPlaceholderEmail = !!user?.email && /@(basswala\.app|basswala\.com)$/i.test(user.email);

  const isPlaceholderName = !!user && (
    (user.firstName?.trim().toLowerCase() === 'basswala' &&
     (user.lastName?.trim().toLowerCase() === 'user' || user.lastName?.trim().toLowerCase() === 'captain'))
  );

  // Apple Sign-In already provides name and email via the Authentication Services
  // framework — Apple Guideline 4 explicitly forbids asking for these again.
  // For Apple users we only gate on a missing phone number (the one field Apple
  // doesn't supply). For all other providers we apply the full check.
  const needsProfileCompletion = !!user && (
    lastProvider === 'apple'
      ? (!user.phone || !String(user.phone).trim())
      : (
          !user.firstName || !user.firstName.trim() ||
          isPlaceholderName ||
          !user.email || isPlaceholderEmail ||
          !user.phone || !String(user.phone).trim()
        )
  );

  return (
    <AuthContext.Provider value={{
      user, isLoading, isAuthenticated: !!user, needsProfileCompletion,
      login, loginWithOtp, loginWithGoogle, loginWithApple, logout, refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
