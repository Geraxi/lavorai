"use client";
import AppError from "./error";

export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <html><body><AppError {...props} /></body></html>;
}
