"use client";

import { useState } from "react";

type Props = {
  onAdd: (name: string) => string | null;
  tone?: "light" | "dark";
};

export function AddInstructorForm({ onAdd, tone = "light" }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const message = onAdd(name);
        if (message) {
          setError(message);
          return;
        }
        setName("");
        setError(null);
      }}
    >
      <label className={`text-xs font-semibold ${tone === "dark" ? "text-slate-200" : "text-slate-600"}`}>
        Instructor que no está en el Excel
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nombre y apellido"
          className="mt-1 block w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
        />
      </label>
      <button
        type="submit"
        className={`rounded-lg px-3 py-2 text-sm font-semibold ${
          tone === "dark"
            ? "bg-white text-slate-900 hover:bg-slate-100"
            : "bg-slate-900 text-white hover:bg-slate-800"
        }`}
      >
        Agregar instructor
      </button>
      {error ? (
        <p className={`w-full text-xs ${tone === "dark" ? "text-amber-200" : "text-amber-800"}`}>{error}</p>
      ) : null}
    </form>
  );
}
