import Modal from './Modal'

// Yes/no confirmation dialog used by the E-Board Events and Event Detail pages.
export default function ConfirmModal({ title, body, confirmLabel, confirmClassName = 'btn', busy, onConfirm, onClose }) {
  return (
    <Modal onClose={onClose} labelledBy="confirm-title">
      <h2 id="confirm-title">{title}</h2>
      <p className="note-text">{body}</p>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <button type="button" className={confirmClassName} disabled={busy} onClick={onConfirm}>
          {busy ? 'Working...' : confirmLabel}
        </button>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}
