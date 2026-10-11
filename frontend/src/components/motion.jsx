import { useEffect, useRef, useState } from 'react';
import { motion, useInView, animate } from 'framer-motion';

export const EASE = [0.16, 1, 0.3, 1];

export function Reveal({ children, delay = 0, y = 24, className = '', once = true }) {
  return (
    <motion.div
      className={`min-w-0 ${className}`}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, amount: 0.15 }}
      transition={{ duration: 0.9, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/* Masked line-by-line kinetic reveal — the signature on-load moment */
export function KineticLines({ lines, className = '', lineClassName = '', as: Tag = 'h1', delay = 0, stagger = 0.12 }) {
  const arr = Array.isArray(lines) ? lines : [lines];
  return (
    <Tag className={className}>
      {arr.map((l, i) => (
        <span key={i} className={`block overflow-hidden ${lineClassName}`}>
          <motion.span
            className="block will-change-transform"
            initial={{ y: '110%', rotate: 2.5 }}
            animate={{ y: '0%', rotate: 0 }}
            transition={{ duration: 1.1, delay: delay + i * stagger, ease: EASE }}
          >
            {l}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

export function CountUp({ value, decimals = 0, suffix = '', className = '', duration = 1.4 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration,
      ease: EASE,
      onUpdate: (v) => setDisplay(v.toLocaleString('en-US', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })),
    });
    return () => controls.stop();
  }, [inView, value, decimals, duration]);

  return (
    <span ref={ref} className={className}>
      {display}
      {suffix}
    </span>
  );
}

/* Mouse-tracked 3D tilt — the subtle 3D hero moment */
export function TiltCard({ children, className = '', intensity = 8, testid }) {
  const ref = useRef(null);
  const [t, setT] = useState({ rx: 0, ry: 0 });

  const onMove = (e) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setT({ rx: -py * intensity, ry: px * intensity });
  };

  return (
    <motion.div
      ref={ref}
      data-testid={testid}
      className={className}
      onMouseMove={onMove}
      onMouseLeave={() => setT({ rx: 0, ry: 0 })}
      animate={{ rotateX: t.rx, rotateY: t.ry }}
      transition={{ type: 'spring', stiffness: 120, damping: 18 }}
      style={{ transformStyle: 'preserve-3d', transformPerspective: 1200 }}
    >
      {children}
    </motion.div>
  );
}
