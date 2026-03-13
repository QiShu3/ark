import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type User = {
  id: number;
  username: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
};

type AuthState = {
  token: string | null;
  expiresAt: number | null;
  user: User | null;
  setSession: (token: string, expiresInSeconds: number) => void;
  setUser: (user: User) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      expiresAt: null,
      user: null,
      setSession: (token, expiresInSeconds) =>
        set({
          token,
          expiresAt: Date.now() + Math.max(1, expiresInSeconds) * 1000,
        }),
      setUser: (user) => set({ user }),
      clear: () => set({ token: null, expiresAt: null, user: null }),
    }),
    { name: 'ark-auth' },
  ),
);
