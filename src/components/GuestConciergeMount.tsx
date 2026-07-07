import { useLocation } from 'react-router-dom';
import GuestConciergeChat from '@/components/GuestConciergeChat';

const GUEST_PORTAL_KEY = 'guest_portal_session';

interface GuestPortalSession {
  booking_id: string;
  room_id: string;
  room_name: string;
  guest_name: string;
  check_out: string;
  expires: number;
}

function readSession(): GuestPortalSession | null {
  try {
    const raw = sessionStorage.getItem(GUEST_PORTAL_KEY);
    if (!raw) return null;
    const session: GuestPortalSession = JSON.parse(raw);
    if (!session.booking_id || !session.guest_name || session.expires < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export default function GuestConciergeMount() {
  const location = useLocation();
  if (location.pathname !== '/guest-portal') return null;
  const session = readSession();
  if (!session) return null;
  return <GuestConciergeChat session={session} />;
}
