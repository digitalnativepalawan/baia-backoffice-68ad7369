import { useEffect, useRef, useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

const SESSION_KEY = 'staff_home_session';
const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes

interface RequireAuthProps {
  children: ReactNode;
}

const getSession = () => {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      const s = JSON.parse(stored);
      if (s.expiresAt > Date.now()) return s;
      sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
  }
  return null;
};

const RequireAuth = ({ children }: RequireAuthProps) => {
  const navigate = useNavigate();
  const [session, setSession] = useState(getSession);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Redirect if no session
  useEffect(() => {
    if (!session) {
      navigate('/', { replace: true });
    }
  }, [session, navigate]);

  // Inactivity timeout
  useEffect(() => {
    if (!session) return;

    const resetTimer = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem('emp_id');
        localStorage.removeItem('emp_name');
        setSession(null);
      }, INACTIVITY_TIMEOUT);
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(e => document.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      events.forEach(e => document.removeEventListener(e, resetTimer));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [session]);

  if (!session) return null;

  return <>{children}</>;
};

export default RequireAuth;
