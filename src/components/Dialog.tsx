import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export default function Dialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    // showModal() lands on the close button; a dialog with a form should start in its first field.
    dialog.querySelector<HTMLElement>('input, textarea')?.focus();
    // If the browser closes the dialog on its own (Escape without a cancel event), keep the owner in sync.
    // A close event can also arrive late from our own cleanup after StrictMode re-runs this effect,
    // so only a dialog that is really closed counts.
    const onNativeClose = () => { if (!dialog.open) closeRef.current(); };
    dialog.addEventListener('close', onNativeClose);
    return () => {
      dialog.removeEventListener('close', onNativeClose);
      if (dialog.open) dialog.close();
      previous?.focus();
    };
  }, []);
  return <dialog ref={ref} className={`dialog ${wide ? 'dialog-wide' : ''}`} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === ref.current) { const r = ref.current.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}>
    <div className="dialog-heading"><h2>{title}</h2><button className="icon-button" aria-label="닫기" onClick={onClose}><X size={21} /></button></div>
    {children}
  </dialog>;
}
