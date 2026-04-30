import React from "react";

const URL_REGEX = /(https?:\/\/[^\s]+)/g;
const URL_ONLY_REGEX = /^https?:\/\/[^\s]+$/;

export default function LinkifiedText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const parts = text.split(URL_REGEX);
  return (
    <span className={className}>
      {parts.map((part, idx) => {
        if (URL_ONLY_REGEX.test(part)) {
          return (
            <a
              key={`${part}-${idx}`}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline break-all"
            >
              {part}
            </a>
          );
        }
        return <React.Fragment key={`${part}-${idx}`}>{part}</React.Fragment>;
      })}
    </span>
  );
}
