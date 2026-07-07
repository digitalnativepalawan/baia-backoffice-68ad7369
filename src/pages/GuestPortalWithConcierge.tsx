import { useEffect, useState } from 'react';
import GuestPortalPage from './GuestPortal';
import GuestConciergeChat from '@/components/GuestConciergeChat';

const GUEST_PORTAL_KEY = 'guest_portal_session';

type GuestSession = {
  booking_id: string;
  room_id: string;
  room_name: string;
  guest_name: string;
  check_out: string;
  expires: number;
};

function readGuestSession(): GuestSession | null {
  try {
    const raw = sessionStorage.getItem(GUEST_PORTAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuestSession;
    if (!parsed.booking_id || !parsed.guest_name || parsed.expires < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function GuestPortalWithConcierge() {
  const [session, setSession] = useState<GuestSession | null>(() => readGuestSession());

  useEffect(() => {
    const sync = () => setSession(readGuestSession());
    const timer = window.setInterval(sync, 750);
    window.addEventListener('storage', sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return (
    <>
      <GuestPortalPage />
      {session && <GuestConciergeChat session={session} />}
    </>
  );
}
