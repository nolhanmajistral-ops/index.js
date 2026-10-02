import clsx from "clsx";

/** Libellé associé par htmlFor (nom accessible = libellé seul, jamais le contenu du contrôle). */
export function Field({ label, name, error, hint, className, children }: { label: string; name?: string; error?: string; hint?: string; className?: string; children?: React.ReactNode }) {
  return (
    <div className={clsx("block space-y-1.5", className)}>
      <label className="label block" htmlFor={name}>{label}</label>
      {children}
      {hint ? <span className="block text-xs text-mute">{hint}</span> : null}
      {error ? <span role="alert" className="block text-xs text-bad">{error}</span> : null}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input id={props.name} {...props} className={clsx("input", props.className)} />;
}

export function Select({ options, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <select id={props.name} {...props} className={clsx("input appearance-none", props.className)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea id={props.name} rows={3} {...props} className={clsx("input", props.className)} />;
}
