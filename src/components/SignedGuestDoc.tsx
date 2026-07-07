import { useEffect, useState, ImgHTMLAttributes, AnchorHTMLAttributes } from 'react';
import { signedGuestDocUrl } from '@/lib/signedGuestDoc';

/** <img> that resolves a private guest-documents URL to a signed URL on mount. */
export const SignedGuestDocImage = ({ src, ...rest }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) => {
  const [resolved, setResolved] = useState<string | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    signedGuestDocUrl(src).then(u => { if (!cancelled) setResolved(u); });
    return () => { cancelled = true; };
  }, [src]);
  if (!resolved) return null;
  return <img src={resolved} {...rest} />;
};

/** <a> that resolves href on click so signed URLs are fresh. */
export const SignedGuestDocLink = ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => {
  const open = async (e: React.MouseEvent) => {
    e.preventDefault();
    const url = await signedGuestDocUrl(href);
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  return <a href={href} onClick={open} {...rest}>{children}</a>;
};
