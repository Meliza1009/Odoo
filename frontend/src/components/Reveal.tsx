import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Fades and lifts its children into place the first time they scroll into view.
 * IntersectionObserver only (no scroll listeners); reduced-motion users get the final state immediately via CSS.
 */
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-[opacity,transform,filter] duration-[900ms] ease-soft motion-reduce:transition-none ${
        visible ? 'translate-y-0 opacity-100 blur-0' : 'translate-y-8 opacity-0 blur-[6px] motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:blur-0'
      } ${className}`}
    >
      {children}
    </div>
  )
}
