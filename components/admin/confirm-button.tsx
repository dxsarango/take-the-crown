"use client";

import type { ReactNode } from "react";

/** A submit button that asks before an action that moves money or can't be undone. */
export function ConfirmButton({ question, children, className }: { question: string; children: ReactNode; className: string }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(question)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
