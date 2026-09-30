import { MARKETING_SITE_URL, PRODUCT_NAME } from "@/lib/site";

export function PoweredBy({ className = "" }: { className?: string }) {
  return (
    <a
      href={MARKETING_SITE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-xs text-fg-muted transition-colors hover:text-fg ${className}`}
    >
      {PRODUCT_NAME}
    </a>
  );
}
