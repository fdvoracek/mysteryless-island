import { useEffect, useRef, useState } from "react";

import type { Identity } from "../references";

export function MoreMenu({ busy, duplicate, remove, rootIdentity, rename }: {
  busy: boolean; duplicate: () => void; remove: () => void; rootIdentity?: Identity; rename: (identity: Identity) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function act(callback: () => void) {
    setOpen(false);
    callback();
  }
  return <div className="more-menu" ref={root} onKeyDown={event => {
    if (open && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    }
  }}>
    <button type="button" ref={trigger} aria-label="More actions" aria-haspopup="true" aria-expanded={open}
      onClick={() => setOpen(value => !value)}>⋯</button>
    {open && <ul className="more-menu-list">
      <li><button type="button" disabled={busy} onClick={() => act(duplicate)}>Duplicate</button></li>
      {rootIdentity && <li><button type="button" disabled={busy || !!rootIdentity.reserved} title={rootIdentity.reserved}
        onClick={() => act(() => rename(rootIdentity))}>Rename ID…</button></li>}
      <li><button type="button" disabled={busy} onClick={() => act(remove)}>Delete</button></li>
    </ul>}
  </div>;
}
