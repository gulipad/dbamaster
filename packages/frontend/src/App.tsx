import { useState, useRef, useEffect, useCallback, type CSSProperties } from "react";
import { MastraClient } from "@mastra/client-js";

const client = new MastraClient({ baseUrl: "" });

const ASCII_FRONT = `
██████╗ ██████╗  █████╗ ███╗   ███╗ █████╗ ███████╗████████╗███████╗██████╗
██╔══██╗██╔══██╗██╔══██╗████╗ ████║██╔══██╗██╔════╝╚══██╔══╝██╔════╝██╔══██╗
██║  ██║██████╔╝███████║██╔████╔██║███████║███████╗   ██║   █████╗  ██████╔╝
██║  ██║██╔══██╗██╔══██║██║╚██╔╝██║██╔══██║╚════██║   ██║   ██╔══╝  ██╔══██╗
██████╔╝██████╔╝██║  ██║██║ ╚═╝ ██║██║  ██║███████║   ██║   ███████╗██║  ██║
╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
`.trimStart();

const ASCII_BACK = `
██████  ██████   █████  ███    ███  █████  ███████ ████████ ███████ ██████
██   ██ ██   ██ ██   ██ ████  ████ ██   ██ ██         ██    ██      ██   ██
██   ██ ██████  ███████ ██ ████ ██ ███████ ███████    ██    █████   ██████
██   ██ ██   ██ ██   ██ ██  ██  ██ ██   ██      ██    ██    ██      ██   ██
██████  ██████  ██   ██ ██      ██ ██   ██ ███████    ██    ███████ ██   ██
`.trimStart();

type LogEntry =
  | { type: "system"; text: string }
  | { type: "tool-call"; name: string }
  | { type: "tool-result"; name: string }
  | { type: "text"; text: string }
  | { type: "error"; text: string };

export function App() {
  const [input, setInput] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [done, setDone] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [logs, scrollToBottom]);

  const handleStart = async () => {
    if (!input.trim() || streaming) return;

    setLogs([{ type: "system", text: `> ${input}` }]);
    setStreaming(true);
    setDone(false);

    try {
      const agent = client.getAgent("assistant");
      const stream = await agent.stream(input);

      await stream.processDataStream({
        onChunk: async (chunk) => {
          if (chunk.type === "text-delta") {
            const text = chunk.payload.text;
            setLogs((prev) => {
              const last = prev[prev.length - 1];
              if (last?.type === "text") {
                return [...prev.slice(0, -1), { type: "text", text: last.text + text }];
              }
              return [...prev, { type: "text", text }];
            });
          } else if (chunk.type === "tool-call") {
            setLogs((prev) => [
              ...prev,
              { type: "tool-call", name: chunk.payload.toolName },
            ]);
          } else if (chunk.type === "tool-result") {
            setLogs((prev) => [
              ...prev,
              { type: "tool-result", name: chunk.payload.toolName },
            ]);
          }
        },
      });
    } catch (err) {
      setLogs((prev) => [
        ...prev,
        { type: "error", text: `ERROR: ${err instanceof Error ? err.message : String(err)}` },
      ]);
    } finally {
      setStreaming(false);
      setDone(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleStart();
  };

  const handleReset = () => {
    setLogs([]);
    setDone(false);
    setInput("");
    inputRef.current?.focus();
  };

  return (
    <div style={styles.container}>
      <div style={styles.asciiWrapper}>
        <pre style={styles.asciiShadow}>{ASCII_BACK}</pre>
        <pre style={styles.ascii}>{ASCII_FRONT}</pre>
      </div>
      <p style={styles.subtitle}>legal entity finder // v1.0</p>

      <div style={styles.divider} />

      {logs.length === 0 ? (
        <div style={styles.inputArea}>
          <p style={styles.hint}>
            Enter a DBA name, website, and/or address to find the legal entity.
          </p>
          <div style={styles.inputRow}>
            <span style={styles.prompt}>&gt;</span>
            <input
              ref={inputRef}
              style={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Joe's Pizza, joespizza.com, 123 Main St NY"
              autoFocus
              disabled={streaming}
            />
            <button
              style={{
                ...styles.button,
                opacity: input.trim() && !streaming ? 1 : 0.4,
              }}
              onClick={handleStart}
              disabled={!input.trim() || streaming}
            >
              [ START ]
            </button>
          </div>
        </div>
      ) : (
        <div ref={outputRef} style={styles.output}>
          {logs.map((entry, i) => (
            <LogLine key={i} entry={entry} />
          ))}
          {streaming && <span style={styles.cursor}>█</span>}
          {done && (
            <>
              <div style={{ ...styles.divider, marginTop: 16 }} />
              <button style={styles.button} onClick={handleReset}>
                [ NEW SEARCH ]
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  switch (entry.type) {
    case "system":
      return <div style={styles.logSystem}>{entry.text}</div>;
    case "tool-call":
      return (
        <div style={styles.logTool}>
          ⚙ executing: {entry.name}...
        </div>
      );
    case "tool-result":
      return (
        <div style={styles.logToolResult}>
          ✓ {entry.name} complete
        </div>
      );
    case "text":
      return <div style={styles.logText}>{entry.text}</div>;
    case "error":
      return <div style={styles.logError}>{entry.text}</div>;
  }
}

const styles: Record<string, CSSProperties> = {
  container: {
    maxWidth: 800,
    margin: "0 auto",
    padding: "40px 24px",
    minHeight: "100vh",
  },
  asciiWrapper: {
    position: "relative",
    marginBottom: 4,
  },
  asciiShadow: {
    position: "absolute",
    top: 2,
    left: 2,
    fontSize: "0.7rem",
    lineHeight: 1.2,
    color: "var(--amber-dim)",
    opacity: 0.3,
    whiteSpace: "pre",
    userSelect: "none",
  },
  ascii: {
    position: "relative",
    fontSize: "0.7rem",
    lineHeight: 1.2,
    color: "var(--amber)",
    whiteSpace: "pre",
  },
  subtitle: {
    fontSize: "0.75rem",
    opacity: 0.5,
    marginBottom: 24,
  },
  divider: {
    borderBottom: "1px solid var(--amber-dim)",
    opacity: 0.3,
    marginBottom: 24,
  },
  hint: {
    fontSize: "0.8rem",
    opacity: 0.6,
    marginBottom: 16,
  },
  inputArea: {},
  inputRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  prompt: {
    fontSize: "0.9rem",
    opacity: 0.8,
  },
  input: {
    flex: 1,
    background: "transparent",
    border: "1px solid var(--amber-dim)",
    color: "var(--amber)",
    fontFamily: "inherit",
    fontSize: "0.85rem",
    padding: "8px 12px",
    outline: "none",
  },
  button: {
    background: "transparent",
    border: "1px solid var(--amber)",
    color: "var(--amber)",
    fontFamily: "inherit",
    fontSize: "0.8rem",
    padding: "8px 16px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  output: {
    maxHeight: "calc(100vh - 220px)",
    overflowY: "auto",
    paddingRight: 8,
  },
  cursor: {
    animation: "blink 1s step-end infinite",
    fontSize: "0.85rem",
  },
  logSystem: {
    fontSize: "0.8rem",
    opacity: 0.7,
    marginBottom: 12,
    fontStyle: "italic",
  },
  logTool: {
    fontSize: "0.75rem",
    color: "var(--amber-dim)",
    marginBottom: 4,
    paddingLeft: 8,
  },
  logToolResult: {
    fontSize: "0.75rem",
    color: "var(--amber)",
    opacity: 0.6,
    marginBottom: 8,
    paddingLeft: 8,
  },
  logText: {
    fontSize: "0.85rem",
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  logError: {
    fontSize: "0.8rem",
    color: "#ff4444",
    marginTop: 8,
  },
};
