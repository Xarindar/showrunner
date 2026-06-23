import NextImage from "next/image";

type TestimonialAvatarProps = {
  imageUrl: string;
  name: string;
  size?: number;
};

export function TestimonialAvatar({ imageUrl, name, size = 48 }: TestimonialAvatarProps) {
  return (
    <span className="testimonial-avatar" style={{ height: size, width: size }}>
      {imageUrl ? (
        <NextImage alt="" height={size} src={imageUrl} unoptimized width={size} />
      ) : (
        <span aria-hidden="true">{testimonialInitials(name)}</span>
      )}
    </span>
  );
}

function testimonialInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "★";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
