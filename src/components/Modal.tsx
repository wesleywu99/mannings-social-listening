'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

/**
 * 統一模態框：背景漸變模糊 + 從中心 scale 緩出（350ms ease-in-out），含關閉動畫。
 * children 為 render-prop，接收 close()（會先播退場動畫再 onClose）。
 */
export function Modal({
  onClose,
  maxWidth = '640px',
  children,
}: {
  onClose: () => void;
  maxWidth?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [closing, setClosing] = useState(false);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 290);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <div
      className={`modal-scrim${closing ? ' modal-closing' : ''}`}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        className="modal-pop bg-surface border border-outline-variant rounded-[18px] shadow-2xl w-full max-h-[86vh] overflow-y-auto"
        style={{ maxWidth }}
        role="dialog"
        aria-modal="true"
      >
        {children(close)}
      </div>
    </div>
  );
}
