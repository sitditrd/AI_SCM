import { useState, type ReactNode } from 'react';
import './InfoTip.css';

/* 마우스 오버 시 말풍선으로 기능/화면을 소개하는 툴팁 */
export function InfoTip({ text, children }: { text: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="infotip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
    >
      {children ?? <span className="infotip-mark" aria-hidden>?</span>}
      {open && <span className="infotip-bubble" role="tooltip">{text}</span>}
    </span>
  );
}
