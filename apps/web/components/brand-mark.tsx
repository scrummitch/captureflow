/** A simple F monogram for the Flindev recorder. */
export function BrandMark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="currentColor"
      aria-hidden
      focusable="false"
      className={className}
    >
      <path d="M7 5h20v5H13v6h11v5H13v11H7z" transform="translate(0 -2)" />
    </svg>
  );
}
