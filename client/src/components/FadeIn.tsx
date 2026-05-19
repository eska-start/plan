import { useEffect, useRef, useState } from "react";

interface Props {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  direction?: "up" | "left" | "right" | "none";
}

export default function FadeIn({ children, delay = 0, className, direction = "up" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    // Fallback: always show after 500ms in case IntersectionObserver doesn't fire (iOS Safari timing)
    const fallback = setTimeout(() => setVisible(true), 500);
    if (!el) return () => clearTimeout(fallback);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { setVisible(true); observer.unobserve(el); }
      },
      { threshold: 0.04 }
    );
    observer.observe(el);
    return () => { observer.disconnect(); clearTimeout(fallback); };
  }, []);

  const initTransform =
    direction === "up" ? "translateY(18px)"
    : direction === "left" ? "translateX(-18px)"
    : direction === "right" ? "translateX(18px)"
    : "none";

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : initTransform,
        transition: `opacity 0.45s ease ${delay}s, transform 0.45s ease ${delay}s`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}
