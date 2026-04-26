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
    if (!el) return;

    // 모바일 브라우저 재접속/복원 시 IntersectionObserver 콜백이 누락되는 케이스 방어
    // (콜백이 누락되면 opacity:0 상태가 유지되어 흰 화면처럼 보일 수 있음)
    const fallback = window.setTimeout(() => setVisible(true), 900);

    if (typeof window.IntersectionObserver === "undefined") {
      setVisible(true);
      return () => window.clearTimeout(fallback);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
          window.clearTimeout(fallback);
        }
      },
      { threshold: 0.04 }
    );

    observer.observe(el);

    return () => {
      window.clearTimeout(fallback);
      observer.disconnect();
    };
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
