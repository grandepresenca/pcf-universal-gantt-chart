import * as React from "react";

/**
 * One-line, maker-facing notice for extra-columns configuration issues.
 * Shows the first message and how many more there are; the full list is in
 * the tooltip (and was logged once with console.warn). Renders nothing when
 * the configuration is fine.
 */
export function ExtraColumnsNotice({
  messages,
}: {
  messages: readonly string[];
}): React.ReactElement | null {
  if (messages.length === 0) {
    return null;
  }
  const more = messages.length > 1 ? ` (+${messages.length - 1} more)` : "";
  return (
    <div
      className="Gantt-Extra-Columns-Notice"
      role="status"
      title={messages.join("\n")}
    >
      {messages[0]}
      {more}
    </div>
  );
}
