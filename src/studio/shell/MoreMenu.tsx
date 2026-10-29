import { useEffect, useRef, useState } from "react";

export function MoreMenu({ busy, duplicate, remove }: { busy: boolean; duplicate: () => void; remove: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        // Keep the pointer's default focus change from undoing the disclosure's focus return.
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
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
      <li><button type="button" disabled={busy} onClick={() => act(remove)}>Delete</button></li>
    </ul>}
  </div>;
}
