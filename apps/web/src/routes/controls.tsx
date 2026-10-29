import { useEffect, useState } from 'react';

interface Control {
  id: string;
  ref: string;
  title: string;
  theme: string;
}

export function Controls() {
  const [controls, setControls] = useState<Control[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/controls')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.statusText))))
      .then(setControls)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Annex A controls</h1>
      {error && <p className="mt-4 text-red-600">Failed to load controls: {error}</p>}
      {!controls && !error && <p className="mt-4 text-slate-500">Loading…</p>}
      {controls && (
        <table className="mt-6 w-full border-collapse bg-white text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="p-2">Ref</th>
              <th className="p-2">Title</th>
              <th className="p-2">Theme</th>
            </tr>
          </thead>
          <tbody>
            {controls.map((c) => (
              <tr key={c.id} className="border-b border-slate-100">
                <td className="p-2 font-mono">{c.ref}</td>
                <td className="p-2">{c.title}</td>
                <td className="p-2 capitalize">{c.theme}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
