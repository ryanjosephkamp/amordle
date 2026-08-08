'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Frame } from './scripts';

/*
 * The sequencer behind the Help figures. It is `useTerminalSequence` from v7.2 generalised
 * in exactly two ways — a per-frame hold instead of one fixed beat, and a chained timer
 * instead of N cumulative ones, because at ~120 frames cumulative timers drift.
 *
 * Everything that made the original safe is preserved verbatim, and both properties are
 * load-bearing rather than decorative:
 *
 * THE FINISHED STATE IS THE INITIAL STATE. The index starts at the LAST frame, so the
 * figure renders fully resolved on the server and only winds back if a client that can
 * animate scrolls it into view. No JavaScript, no IntersectionObserver, reduced motion, or
 * a crawler all get the complete figure rather than a blank box waiting for an animation
 * that will never run. That matters more here than it did for three swatches: the terminal
 * frame of the COMBAT figure is eight rows deep with an all-green last row, which is the
 * single most teaching-dense frame in the sequence.
 *
 * REDUCED MOTION IS CHECKED IN JAVASCRIPT, twice. The global reduced-motion block stops
 * CSS animation only; a JS timer sails straight through it. So the check is made before
 * installing the observer AND inside `play()`, which is what makes the replay control a
 * deliberate no-op rather than a way to force motion on someone who asked for none.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function useFrameSequence(frames: readonly Frame[]) {
  const ref = useRef<HTMLElement | null>(null);
  const timer = useRef<number | null>(null);
  const [index, setIndex] = useState(frames.length - 1);

  const clear = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const play = useCallback(() => {
    clear();
    if (prefersReducedMotion()) {
      setIndex(frames.length - 1);
      return;
    }
    let current = 0;
    setIndex(0);
    const step = () => {
      if (current >= frames.length - 1) {
        timer.current = null;
        return;
      }
      timer.current = window.setTimeout(() => {
        current += 1;
        setIndex(current);
        step();
      }, frames[current]?.hold ?? 700);
    };
    step();
  }, [clear, frames]);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        play();
      },
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      clear();
    };
  }, [clear, play]);

  return { ref, frame: frames[index] ?? frames[frames.length - 1]!, play };
}

export function ReplayButton({ onClick, label }: { onClick(): void; label: string }) {
  return (
    <button type="button" className="help-replay" onClick={onClick}>
      <span aria-hidden="true">↻</span> replay
      <span className="sr-only"> {label}</span>
    </button>
  );
}
