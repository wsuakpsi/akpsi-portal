import { useState } from 'react'
import toast from 'react-hot-toast'
import './Apply.css'
import { CrestIcon } from '../components/AuthShell'
import { resizeImage } from '../lib/resizeImage'
import { APPLICATIONS_OPEN, applicationsClosed } from '../config/recruitment'
import {
  STANDING_OPTIONS,
  GRADUATION_YEAR_OPTIONS,
  YES_NO_OPTIONS,
  YES_NO_MAYBE_OPTIONS,
  LATE_CLASS_DAY_OPTIONS,
  submitApplication,
} from '../lib/applications'

// Mirrors the rush-applications bucket's file_size_limit (migration 0029).
const MAX_FILE_MB = 10
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024

const initialFields = {
  fullName: '',
  pronouns: '',
  accessId: '',
  wayneStateEmail: '',
  alternateEmail: '',
  standing: '',
  graduationYear: '',
  gpa: '',
  majors: '',
  minors: '',
  everTransferred: '',
  transferFromDetails: '',
  plansToTransfer: '',
  transferToDetails: '',
  titleIxViolation: '',
  felonyConviction: '',
  howHeard: '',
  lateClassDays: [],
  additionalComments: '',
}

function Required() {
  return <span className="apply-req" aria-hidden="true">*</span>
}

function TextField({ id, label, value, onChange, required, type = 'text', placeholder, hint }) {
  return (
    <div className="apply-field">
      <label htmlFor={id}>
        {label}
        {required && <Required />}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
      />
      {hint && <span className="apply-hint">{hint}</span>}
    </div>
  )
}

function TextAreaField({ id, label, value, onChange, required, placeholder }) {
  return (
    <div className="apply-field">
      <label htmlFor={id}>
        {label}
        {required && <Required />}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </div>
  )
}

function ChoiceField({ name, legend, options, value, onChange, required }) {
  return (
    <fieldset className="apply-field apply-fieldset">
      <legend>
        {legend}
        {required && <Required />}
      </legend>
      <div className="apply-chips">
        {options.map((opt) => (
          <label className={`apply-chip ${value === opt ? 'selected' : ''}`} key={opt}>
            <input
              type="radio"
              name={name}
              value={opt}
              checked={value === opt}
              onChange={() => onChange(opt)}
              required={required}
            />
            {opt}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

// Multi-select chips. `exclusive` names an option (e.g. "None") that clears
// the others when picked and is cleared when any other is picked.
function MultiChoiceField({ name, legend, options, value, onChange, required, exclusive }) {
  function toggle(opt) {
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt))
    } else if (opt === exclusive) {
      onChange([opt])
    } else {
      onChange([...value.filter((v) => v !== exclusive), opt])
    }
  }

  return (
    <fieldset className="apply-field apply-fieldset">
      <legend>
        {legend}
        {required && <Required />}
      </legend>
      <div className="apply-chips">
        {options.map((opt) => {
          const selected = value.includes(opt)
          return (
            <label className={`apply-chip ${selected ? 'selected' : ''}`} key={opt}>
              <input
                type="checkbox"
                name={name}
                value={opt}
                checked={selected}
                onChange={() => toggle(opt)}
                required={required && value.length === 0}
              />
              {opt}
            </label>
          )
        })}
      </div>
      <span className="apply-hint">Select all that apply.</span>
    </fieldset>
  )
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function FileField({ id, label, file, onChange, accept, hint, processing }) {
  let status = 'No file selected'
  if (processing) status = 'Optimizing…'
  else if (file) status = `${file.name} · ${formatSize(file.size)}`

  return (
    <div className="apply-field">
      <label htmlFor={id}>
        {label}
        <Required />
      </label>
      <label className={`apply-file ${file ? 'has-file' : ''}`} htmlFor={id}>
        <input id={id} type="file" accept={accept} onChange={(e) => onChange(e.target.files?.[0] || null)} required />
        <span className="apply-file-btn">{file ? 'Replace' : 'Choose file'}</span>
        <span className="apply-file-name">{status}</span>
      </label>
      {hint && <span className="apply-hint">{hint}</span>}
    </div>
  )
}

function Section({ title, description, children }) {
  return (
    <section className="apply-section">
      <div className="apply-section-head">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </section>
  )
}

function Header() {
  return (
    <header className="apply-header">
      <div className="apply-header-inner">
        <div className="apply-header-crest"><CrestIcon /></div>
        <div>
          <div className="apply-header-name">Alpha Kappa Psi</div>
          <div className="apply-header-sub">Beta Omicron Chapter · Wayne State University</div>
        </div>
      </div>
    </header>
  )
}

export default function Apply() {
  const [fields, setFields] = useState(initialFields)
  const [resume, setResume] = useState(null)
  const [coverLetter, setCoverLetter] = useState(null)
  const [headshot, setHeadshot] = useState(null)
  const [headshotProcessing, setHeadshotProcessing] = useState(false)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  function set(key) {
    return (value) => setFields((prev) => ({ ...prev, [key]: value }))
  }

  async function handleHeadshot(file) {
    setError(null)
    setHeadshot(null)
    if (!file) return
    setHeadshotProcessing(true)
    try {
      setHeadshot(await resizeImage(file))
    } catch {
      setError("We couldn't read that image. Please upload your headshot as a JPEG or PNG.")
    } finally {
      setHeadshotProcessing(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!resume || !coverLetter || !headshot) {
      setError('Please attach your resume, cover letter, and headshot before submitting.')
      return
    }
    if (fields.lateClassDays.length === 0) {
      setError('Please answer the question about classes after 8 PM (choose "None" if that applies).')
      return
    }
    const oversized = [
      ['Resume', resume],
      ['Cover letter', coverLetter],
      ['Headshot', headshot],
    ].find(([, file]) => file.size > MAX_FILE_BYTES)
    if (oversized) {
      setError(`${oversized[0]} is too large — each file must be under ${MAX_FILE_MB} MB.`)
      return
    }

    setSubmitting(true)
    try {
      await submitApplication(fields, { resume, coverLetter, headshot })
      setDone(true)
      window.scrollTo({ top: 0 })
    } catch (err) {
      // Postgres unique_violation (0032) — this email already has an
      // application on file.
      if (err.code === '23505') {
        const message =
          "An application with this email has already been submitted. Applications are only accepted once — if you believe this is a mistake, contact your recruitment chair."
        setError(message)
        toast.error(message)
      } else {
        setError(err.message)
        toast.error(`Could not submit application: ${err.message}`)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!APPLICATIONS_OPEN) {
    return (
      <div className="apply-root">
        <Header />
        <div className="apply-success">
          <h1>Applications have not opened yet.</h1>
          <p>Check back soon, or follow the chapter's social media for the recruitment timeline.</p>
          <p className="apply-footer">
            Chapter member? <a href="/login">Sign in</a>
          </p>
        </div>
      </div>
    )
  }

  if (applicationsClosed()) {
    return (
      <div className="apply-root">
        <Header />
        <div className="apply-success">
          <h1>Applications are closed.</h1>
          <p>The application deadline has passed. Follow the chapter's social media for next steps.</p>
          <p className="apply-footer">
            Chapter member? <a href="/login">Sign in</a>
          </p>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="apply-root">
        <Header />
        <div className="apply-success">
          <div className="apply-success-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h1>Application received</h1>
          <p>
            Thank you for applying to Alpha Kappa Psi. We'll be in touch with next steps. If you have any
            questions in the meantime, reach out to the chapter's VP of Membership.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="apply-root">
      <Header />

      <div className="apply-content">
        <div className="apply-intro">
          <h1>Potential New Member Application</h1>
          <p>
            Thank you for attending recruitment. Complete every required field below and attach your
            documents — the whole form takes about ten minutes.
          </p>
          <div className="apply-notice">
            Applications are only accepted once. No late submissions will be allowed, and a second
            application cannot be submitted — if you need to make a correction after submitting, contact
            the VP of Membership.
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {error && <div className="apply-error" role="alert">{error}</div>}

          <Section title="Personal information">
            <div className="apply-row">
              <TextField id="fullName" label="First and last name" value={fields.fullName} onChange={set('fullName')} required />
              <TextField id="pronouns" label="Pronouns" value={fields.pronouns} onChange={set('pronouns')} placeholder="e.g. she/her" required />
            </div>
            <TextField id="accessId" label="Access ID" value={fields.accessId} onChange={set('accessId')} placeholder="e.g. ab1234" required />
            <div className="apply-row">
              <TextField id="wayneStateEmail" label="Wayne State email" type="email" value={fields.wayneStateEmail} onChange={set('wayneStateEmail')} required />
              <TextField id="alternateEmail" label="Alternate email" type="email" value={fields.alternateEmail} onChange={set('alternateEmail')} required />
            </div>
          </Section>

          <Section title="Academics">
            <ChoiceField name="standing" legend="Current standing" options={STANDING_OPTIONS} value={fields.standing} onChange={set('standing')} required />
            <ChoiceField name="graduationYear" legend="Expected graduation" options={GRADUATION_YEAR_OPTIONS} value={fields.graduationYear} onChange={set('graduationYear')} required />
            <div className="apply-row">
              <TextField id="gpa" label="Current overall GPA" value={fields.gpa} onChange={set('gpa')} placeholder="e.g. 3.6" required />
              <TextField id="majors" label="Major(s)" value={fields.majors} onChange={set('majors')} required />
            </div>
            <TextField id="minors" label="Minor(s)" value={fields.minors} onChange={set('minors')} placeholder="Enter N/A if none" required />
          </Section>

          <Section title="Documents" description={`PDF format for the resume and cover letter, under ${MAX_FILE_MB} MB each. Name files LastName_FirstName_Type.`}>
            <FileField id="resume" label="Resume" file={resume} onChange={setResume} accept="application/pdf" hint="LastName_FirstName_Resume.pdf" />
            <FileField id="coverLetter" label="Cover letter" file={coverLetter} onChange={setCoverLetter} accept="application/pdf" hint="LastName_FirstName_Coverletter.pdf" />
            <FileField
              id="headshot"
              label="Headshot"
              file={headshot}
              onChange={handleHeadshot}
              accept="image/*"
              processing={headshotProcessing}
              hint="LastName_FirstName_Headshot — any photo works; it's resized automatically"
            />
          </Section>

          <Section title="Academic history">
            <ChoiceField
              name="everTransferred"
              legend="Have you ever transferred universities or colleges? This includes obtaining an Associate's degree from another school."
              options={YES_NO_OPTIONS}
              value={fields.everTransferred}
              onChange={set('everTransferred')}
              required
            />
            {fields.everTransferred === 'Yes' && (
              <TextAreaField
                id="transferFromDetails"
                label="Which school did you transfer from, and why?"
                value={fields.transferFromDetails}
                onChange={set('transferFromDetails')}
              />
            )}
            <ChoiceField
              name="plansToTransfer"
              legend="Do you plan on transferring to another 4-year university or school during your time as an undergraduate?"
              options={YES_NO_MAYBE_OPTIONS}
              value={fields.plansToTransfer}
              onChange={set('plansToTransfer')}
              required
            />
            {(fields.plansToTransfer === 'Yes' || fields.plansToTransfer === 'Maybe') && (
              <TextAreaField
                id="transferToDetails"
                label="Which school are you considering, and why?"
                value={fields.transferToDetails}
                onChange={set('transferToDetails')}
              />
            )}
          </Section>

          <Section title="Conduct">
            <div className="apply-policy">
              Alpha Kappa Psi has adopted a policy towards discrimination and all forms of harassment,
              including but not limited to sexual harassment. No form of discriminatory or harassing
              conduct towards any brother, pledge, potential member, or other person outside of our
              brotherhood will be tolerated.
            </div>
            <ChoiceField name="titleIxViolation" legend="Have you ever been involved with a Title IX violation?" options={YES_NO_OPTIONS} value={fields.titleIxViolation} onChange={set('titleIxViolation')} required />
            <ChoiceField name="felonyConviction" legend="Have you ever been convicted of a felony?" options={YES_NO_OPTIONS} value={fields.felonyConviction} onChange={set('felonyConviction')} required />
          </Section>

          <Section title="Additional information">
            <TextAreaField id="howHeard" label="How did you hear about Alpha Kappa Psi?" value={fields.howHeard} onChange={set('howHeard')} required />
            <MultiChoiceField
              name="lateClassDays"
              legend="Do you have any classes that run later than 8 PM? If so, which days?"
              options={LATE_CLASS_DAY_OPTIONS}
              value={fields.lateClassDays}
              onChange={set('lateClassDays')}
              exclusive="None"
              required
            />
            <TextAreaField id="additionalComments" label="Any comments, questions, or concerns?" value={fields.additionalComments} onChange={set('additionalComments')} placeholder="Optional" />
          </Section>

          <button type="submit" className="apply-submit" disabled={submitting || headshotProcessing}>
            {submitting ? 'Submitting…' : 'Submit application'}
          </button>

          <p className="apply-footer">
            Chapter member? <a href="/login">Sign in</a>
          </p>
        </form>
      </div>
    </div>
  )
}
