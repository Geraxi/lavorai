"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TIERS, type Tier } from "@/lib/billing";
import "./payment-celebration.css";

interface PaymentCelebrationProps {
  tier: Tier;
  subscriptionId?: string;
}

export function PaymentCelebration({ tier, subscriptionId }: PaymentCelebrationProps) {
  const [show, setShow] = useState(false);
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Check if we've already shown this celebration
    const key = `celebration_shown_${tier}_${subscriptionId || "unknown"}`;
    if (localStorage.getItem(key)) {
      return;
    }

    // Mark as shown
    localStorage.setItem(key, "true");
    setShow(true);

    // Clean up the subscribed param from URL
    const url = new URL(window.location.href);
    if (url.searchParams.has("subscribed")) {
      url.searchParams.delete("subscribed");
      window.history.replaceState({}, "", url.toString());
    }

    // Start confetti animation (respecting prefers-reduced-motion)
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!prefersReducedMotion) {
      startConfetti();
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [tier, subscriptionId]);

  const startConfetti = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Confetti particles
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      color: string;
      size: number;
      rotation: number;
      rotationSpeed: number;
    }> = [];

    const colors = ["#3ecf8e", "#0f9f63", "#e5a54b", "#ededef", "#b4b8bf"];

    // Create particles
    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: -10 - Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 2,
        vy: Math.random() * 3 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 6 + 3,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.2,
      });
    }

    let startTime = Date.now();
    const duration = 3000; // 3 seconds

    const animate = () => {
      const elapsed = Date.now() - startTime;
      if (elapsed > duration) {
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.y += p.vy;
        p.x += p.vx;
        p.rotation += p.rotationSpeed;
        p.vy += 0.1; // gravity

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();
  };

  const handleClose = () => {
    setShow(false);
    router.push("/dashboard");
  };

  if (!show) return null;

  const config = TIERS[tier];
  const displayName = tier === "pro" ? "LavorAI Pro" : "LavorAI Pro+";
  
  // Get top 3 features (clean up icon markers and {soon} tags)
  const features = config.features
    .slice(0, 3)
    .map(f => f.replace(/^\[.*?\]\s*/, "").replace(/\s*\{soon\}/, ""));

  return (
    <div className="celebration-overlay" onClick={handleClose}>
      <canvas ref={canvasRef} className="celebration-confetti" aria-hidden="true" />
      <div className="celebration-modal" onClick={(e) => e.stopPropagation()}>
        <div className="celebration-header">
          <h1 className="celebration-title">Benvenuto in {displayName}</h1>
          <p className="celebration-subtitle">
            Grazie per aver scelto LavorAI. Ora hai accesso a tutte le funzionalità premium.
          </p>
        </div>

        <ul className="celebration-features">
          {features.map((feature, i) => (
            <li key={i} className="celebration-feature">
              <svg
                className="celebration-feature-icon"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.12" />
                <path
                  d="M14 7L8.5 12.5L6 10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        <button className="celebration-cta" onClick={handleClose}>
          Inizia a candidarti
        </button>
      </div>
    </div>
  );
}
