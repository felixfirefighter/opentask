"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function useTypewriter(text: string, reducedMotion = false) {
  const [complete, setComplete] = useState(reducedMotion || text.length === 0);

  useEffect(() => {
    // Each line is shown as a readable chunk, then advances after a pause.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setComplete(reducedMotion || text.length === 0);
    if (reducedMotion || text.length === 0) return;

    const timer = window.setTimeout(() => setComplete(true), 1_800);
    return () => window.clearTimeout(timer);
  }, [reducedMotion, text]);

  const skip = useCallback(() => {
    setComplete(true);
  }, []);

  return { displayed: text, complete, skip };
}

export function Typeline({
  text,
  reducedMotion = false,
  className,
  onComplete,
}: Readonly<{
  text: string;
  reducedMotion?: boolean;
  className?: string;
  onComplete?: () => void;
}>) {
  const { displayed, complete, skip } = useTypewriter(text, reducedMotion);
  const completionRef = useRef(onComplete);

  useEffect(() => {
    completionRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (complete) completionRef.current?.();
  }, [complete]);

  const content = useMemo(() => renderEmphasis(displayed), [displayed]);

  return (
    <div
      className={className}
      role="status"
      tabIndex={complete ? -1 : 0}
      aria-live="polite"
      onClick={() => {
        if (!complete) skip();
      }}
      onKeyDown={(event) => {
        if (!complete && event.key !== "Tab") {
          event.preventDefault();
          skip();
        }
      }}
    >
      {content}
    </div>
  );
}

function renderEmphasis(value: string) {
  return value
    .split(/(\*[^*]*\*)/u)
    .map((part, index) =>
      part.startsWith("*") && part.endsWith("*") ? (
        <em key={`${part}-${index}`}>{part.slice(1, -1)}</em>
      ) : (
        <span key={`${part}-${index}`}>{part}</span>
      ),
    );
}

export function RichText({ value }: Readonly<{ value: string }>) {
  return <>{renderEmphasis(value)}</>;
}
