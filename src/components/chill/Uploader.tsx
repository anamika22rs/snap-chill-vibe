import { useRef, useState, type ReactNode } from "react";

/** Renders a tap target that opens the camera/gallery and hands back the file + preview. */
export function Uploader({
  onPick,
  children,
  className,
  capture = false,
}: {
  onPick: (file: File, previewUrl: string) => void;
  children: ReactNode;
  className?: string;
  capture?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [key, setKey] = useState(0);

  return (
    <>
      <button type="button" className={className} onClick={() => ref.current?.click()}>
        {children}
      </button>
      <input
        key={key}
        ref={ref}
        type="file"
        accept="image/*"
        {...(capture ? { capture: "environment" as const } : {})}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file, URL.createObjectURL(file));
          setKey((k) => k + 1);
        }}
      />
    </>
  );
}
