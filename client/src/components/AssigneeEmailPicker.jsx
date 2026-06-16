import { useEffect, useState } from 'react';
import { Mail, X, Plus } from 'lucide-react';
import { api } from '../lib/api.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export default function AssigneeEmailPicker({ emails, onChange, disabled }) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getActionItemEmailSuggestions()
      .then(({ emails: list }) => setSuggestions(list || []))
      .catch(() => {});
  }, []);

  function addEmail(raw) {
    const email = raw.trim().toLowerCase();
    if (!email) return;
    if (!EMAIL_RE.test(email)) {
      setError('Enter a valid email address');
      return;
    }
    if (emails.includes(email)) {
      setError('Email already added');
      return;
    }
    setError('');
    onChange([...emails, email]);
    setInput('');
  }

  function removeEmail(email) {
    onChange(emails.filter((e) => e !== email));
  }

  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, marginBottom: 6 }}>
        <Mail size={12} /> Assign to (email addresses)
      </label>
      <p style={{ fontSize: 11, color: 'var(--slate-300)', marginBottom: 8, lineHeight: 1.4 }}>
        Add one or more people. Platform users will see this on their My Action Items list.
      </p>

      {emails.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {emails.map((email) => (
            <span
              key={email}
              className="badge badge-indigo"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}
            >
              {email}
              {!disabled && (
                <button type="button" onClick={() => removeEmail(email)} style={{ color: 'inherit', opacity: 0.8 }}>
                  <X size={10} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {!disabled && (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="email"
            list="assignee-email-suggestions"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(''); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addEmail(input);
              }
            }}
            placeholder="name@company.com"
            style={{ flex: 1, fontSize: 13 }}
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => addEmail(input)}>
            <Plus size={12} /> Add
          </button>
        </div>
      )}

      <datalist id="assignee-email-suggestions">
        {suggestions.map((email) => (
          <option key={email} value={email} />
        ))}
      </datalist>

      {error && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>{error}</p>}
    </div>
  );
}
