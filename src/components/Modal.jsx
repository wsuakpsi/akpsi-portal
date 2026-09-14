import { useEffect, useRef } from 'react'

// Shared accessible dialog wrapper. Behaviour is identical to the old
// inline `<div className="modal-backdrop" onClick={onClose}>` pattern
// (backdrop click closes, clicks inside don't), plus what screen readers
// and keyboard users need:
//   - role="dialog" + aria-modal so assistive tech treats it as a dialog
//   - aria-labelledby pointing at the heading (pass `labelledBy`)
//   - Escape closes it
//   - focus moves into the dialog on open and returns to the opener on close
//   - the page behind it stops scrolling while it's open
//
// `backdropClassName` / `className` default to the E-Board portal's classes;
// the brother portal's install sheet passes its own.
export default function Modal({
  onClose,
  labelledBy,
  children,
  backdropClassName = 'modal-backdrop',
  className = 'modal',
  closeOnBackdrop = true,
}) {
  const dialogRef = useRef(null)
  // Callers pass inline arrows for onClose, so a dependency on it would tear
  // down and re-run this effect on every parent render (focus jumping back
  // to the opener mid-dialog). Keep the latest handler in a ref instead.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previouslyFocused = document.activeElement
    const dialog = dialogRef.current

    // Focus the first focusable control, falling back to the dialog itself.
    const focusable = dialog?.querySelector(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    )
    ;(focusable || dialog)?.focus?.()

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current?.()
        return
      }
      // Keep Tab cycling inside the dialog.
      if (e.key === 'Tab' && dialog) {
        const items = dialog.querySelectorAll(
          'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
        if (items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus()
    }
  }, [])

  return (
    <div className={backdropClassName} onClick={closeOnBackdrop ? onClose : undefined}>
      <div
        ref={dialogRef}
        className={className}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
