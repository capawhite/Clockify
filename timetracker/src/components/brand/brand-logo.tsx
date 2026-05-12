import Image from "next/image";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  /** `compact` fits dashboard nav; `hero` for marketing home. */
  variant?: "compact" | "hero";
  className?: string;
  /** If false, logo is not wrapped in a link (e.g. next to linked text). */
  withLink?: boolean;
};

export function BrandLogo({
  variant = "compact",
  className,
  withLink = true,
}: BrandLogoProps) {
  const maxH = variant === "hero" ? 56 : 28;
  const width = Math.round(maxH * (480 / 191));
  const img = (
    <Image
      src={brand.logoSrc}
      alt={`${brand.companyName} logo`}
      width={width}
      height={maxH}
      className={cn("h-auto w-auto object-contain object-left", className)}
      style={{ maxHeight: maxH }}
      priority={variant === "hero"}
    />
  );

  if (!withLink) {
    return <span className={cn("inline-flex shrink-0", className)}>{img}</span>;
  }

  return (
    <a
      href={brand.websiteUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex shrink-0 items-center opacity-90 transition-opacity hover:opacity-100",
        className
      )}
      aria-label={`${brand.companyName} — visit website (opens in new tab)`}
    >
      {img}
    </a>
  );
}
