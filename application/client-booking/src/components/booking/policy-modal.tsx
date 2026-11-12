'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { PolicyContent } from './policy-content';

export function PolicyModal({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    heading.current?.focus();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  return <dialog ref={dialog} className="policy-modal" aria-labelledby="policy-modal-title" aria-modal="true" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="policy-modal-header"><div><p className="eyebrow">BOOK WITH CONFIDENCE</p><h2 id="policy-modal-title" ref={heading} tabIndex={-1}>Booking terms &amp; privacy notice</h2><p className="fine-print">Version 2026-11-v1</p></div><button type="button" className="copy-reference" aria-label="Close booking terms and privacy notice" onClick={onClose}><X size={20} /></button></div>
    <div className="policy-modal-content"><PolicyContent /></div>
    <div className="policy-modal-footer"><button type="button" className="button" onClick={onClose}>Close</button></div>
  </dialog>;
}
