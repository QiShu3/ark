import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuthStore } from '../lib/auth';

export default function RequireAuth() {
  const token = useAuthStore((s) => s.token);
  const expiresAt = useAuthStore((s) => s.expiresAt);
  const clear = useAuthStore((s) => s.clear);
  const location = useLocation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
  }, [token, expiresAt]);

  const expired = !!expiresAt && now >= expiresAt;

  useEffect(() => {
    if (token && expired) clear();
  }, [token, expired, clear]);

  if (!token || !expiresAt || expired) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
