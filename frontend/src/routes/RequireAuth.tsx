import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuthStore } from '../lib/auth';

export default function RequireAuth() {
  const token = useAuthStore((s) => s.token);
  const expiresAt = useAuthStore((s) => s.expiresAt);
  const clear = useAuthStore((s) => s.clear);
  const location = useLocation();

  useEffect(() => {
    if (token && expiresAt && Date.now() >= expiresAt) clear();
  }, [token, expiresAt, clear]);

  if (!token || !expiresAt) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
