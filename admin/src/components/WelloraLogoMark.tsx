import { Heart } from "lucide-react";

const sizes = {
  sm: { box: "h-8 w-8 rounded-lg p-1.5", icon: "h-4 w-4" },
  md: { box: "h-10 w-10 rounded-xl p-2", icon: "h-5 w-5" },
};

type Size = keyof typeof sizes;

interface WelloraLogoMarkProps {
  size?: Size;
  className?: string;
}

export function WelloraLogoMark({
  size = "md",
  className = "",
}: WelloraLogoMarkProps) {
  const s = sizes[size];
  return (
    <div
      className={`flex shrink-0 items-center justify-center bg-wellora text-white shadow-sm ${s.box} ${className}`}
      aria-hidden
    >
      <Heart className={`${s.icon} fill-current`} strokeWidth={0} />
    </div>
  );
}
