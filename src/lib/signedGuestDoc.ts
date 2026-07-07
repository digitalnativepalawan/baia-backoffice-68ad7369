import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'guest-documents';
const cache = new Map<string, { url: string; exp: number }>();

/**
 * Given a stored URL (either legacy public URL or raw storage path) for the
 * private guest-documents bucket, return a short-lived signed URL suitable for
 * <img src>/download. Returns the original string for non-bucket URLs.
 */
export async function signedGuestDocUrl(input: string): Promise<string> {
  if (!input) return input;
  // Only handle guest-documents URLs; leave external links untouched.
  const marker = `/${BUCKET}/`;
  let path: string | null = null;
  if (input.includes(marker)) {
    path = input.split(marker)[1] || null;
  } else if (!/^https?:\/\//i.test(input)) {
    path = input;
  }
  if (!path) return input;

  const now = Date.now();
  const hit = cache.get(path);
  if (hit && hit.exp > now + 30_000) return hit.url;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return input;
  cache.set(path, { url: data.signedUrl, exp: now + 3600 * 1000 });
  return data.signedUrl;
}
