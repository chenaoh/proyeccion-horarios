"use client";

import { useState, type DragEvent, type ReactNode } from "react";

type Props = {
  onFile: (file: File) => void;
  className?: string;
  activeClassName?: string;
  children: ReactNode;
};

export function DropZone({ onFile, className = "", activeClassName = "", children }: Props) {
  const [over, setOver] = useState(false);

  function setDrag(e: DragEvent, next: boolean) {
    e.preventDefault();
    e.stopPropagation();
    setOver(next);
  }

  return (
    <div
      onDragEnterCapture={(e) => setDrag(e, true)}
      onDragOverCapture={(e) => {
        setDrag(e, true);
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDropCapture={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      className={`${className} ${over ? activeClassName : ""}`}
    >
      {children}
    </div>
  );
}
