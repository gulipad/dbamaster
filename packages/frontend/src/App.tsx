import { useState, useRef, useEffect, useCallback } from "react";
import { MastraClient } from "@mastra/client-js";

const client = new MastraClient({ baseUrl: "" });
const STORAGE_KEY = "dbamaster:password";

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

const ASCII_FRONT_LINES = ASCII_FRONT.trimEnd().split("\n");

type Stage = "loading" | "password" | "ready";

type LogEntry =
  | { type: "system"; text: string }
  | { type: "tool-call"; name: string }
  | { type: "tool-result"; name: string }
  | { type: "text"; text: string }
  | { type: "error"; text: string }
  | { type: "progress"; text: string };

async function verifyPassword(password: string): Promise<boolean> {
  const res = await fetch("/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  return data.valid === true;
}

export function App() {
  const [stage, setStage] = useState<Stage>("loading");
  const [bootLines, setBootLines] = useState(0);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [input, setInput] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [done, setDone] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Check stored password on mount
  useEffect(() => {
    (async () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const valid = await verifyPassword(stored);
          if (valid) {
            setStage("ready");
            return;
          }
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        // Backend unreachable — clear stale token
        localStorage.removeItem(STORAGE_KEY);
      }
      setStage("password");
    })();
  }, []);

  // Boot animation: front layer reveals line by line
  useEffect(() => {
    if (bootLines >= ASCII_FRONT_LINES.length) return;
    const timer = setTimeout(() => setBootLines((n) => n + 1), 80);
    return () => clearTimeout(timer);
  }, [bootLines]);

  // Keep password input focused unconditionally during password stage
  useEffect(() => {
    if (stage !== "password") return;
    const refocus = () => passwordRef.current?.focus();
    refocus();
    window.addEventListener("click", refocus);
    window.addEventListener("focusout", refocus);
    return () => {
      window.removeEventListener("click", refocus);
      window.removeEventListener("focusout", refocus);
    };
  }, [stage]);

  const scrollToBottom = useCallback(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [logs, scrollToBottom]);

  const handleReset = useCallback(() => {
    setLogs([]);
    setDone(false);
    setInput("");
  }, []);

  useEffect(() => {
    if (!done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") handleReset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, handleReset]);

  // Password handlers
  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    setPasswordError(false);
  };

  const handlePasswordSubmit = async () => {
    if (!password) return;
    const valid = await verifyPassword(password);
    if (valid) {
      localStorage.setItem(STORAGE_KEY, password);
      setStage("ready");
    } else {
      setPasswordError(true);
      setPassword("");
    }
  };

  const handlePasswordKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handlePasswordSubmit();
  };

  const hasWebsite = /[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(input);

  // Query handlers
  const handleStart = async () => {
    if (!hasWebsite || streaming) return;

    // Verify password still valid
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setStage("password");
      setPassword("");
      return;
    }
    const valid = await verifyPassword(stored);
    if (!valid) {
      localStorage.removeItem(STORAGE_KEY);
      setStage("password");
      setPassword("");
      setLogs([]);
      return;
    }

    setLogs([{ type: "system", text: `> ${input}` }]);
    setStreaming(true);
    setDone(false);

    // Subscribe to progress SSE
    const sse = new EventSource("/progress");
    sse.onmessage = (event) => {
      const text = JSON.parse(event.data) as string;
      setLogs((prev) => {
        const last = prev[prev.length - 1];
        if (last?.type === "progress") {
          return [...prev.slice(0, -1), { type: "progress", text }];
        }
        return [...prev, { type: "progress", text }];
      });
    };

    try {
      const agent = client.getAgent("assistant");
      const stream = await agent.stream(input);

      await stream.processDataStream({
        onChunk: async (chunk) => {
          if (chunk.type === "text-delta") {
            const text = chunk.payload.text;
            setLogs((prev) => {
              // Remove trailing progress line when text starts
              const filtered = prev[prev.length - 1]?.type === "progress" ? prev.slice(0, -1) : prev;
              const last = filtered[filtered.length - 1];
              if (last?.type === "text") {
                return [...filtered.slice(0, -1), { type: "text", text: last.text + text }];
              }
              return [...filtered, { type: "text", text }];
            });
          } else if (chunk.type === "tool-call") {
            setLogs((prev) => [
              ...prev,
              { type: "tool-call", name: chunk.payload.toolName },
            ]);
          } else if (chunk.type === "tool-result") {
            setLogs((prev) => {
              // Remove trailing progress line when tool completes
              const filtered = prev[prev.length - 1]?.type === "progress" ? prev.slice(0, -1) : prev;
              return [...filtered, { type: "tool-result", name: chunk.payload.toolName }];
            });
          }
        },
      });
    } catch (err) {
      setLogs((prev) => [
        ...prev,
        { type: "error", text: `ERROR: ${err instanceof Error ? err.message : String(err)}` },
      ]);
    } finally {
      sse.close();
      setStreaming(false);
      setDone(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleStart();
  };


  const animDone = bootLines >= ASCII_FRONT_LINES.length;
  const frontRevealed = animDone
    ? ASCII_FRONT
    : ASCII_FRONT_LINES.slice(0, bootLines).join("\n") + "\n";

  return (
    <div className="container">
      <div className="ascii-wrapper">
        <pre className="ascii-back">{ASCII_BACK}</pre>
        <pre className="ascii-front">{frontRevealed}</pre>
      </div>
      <p className="subtitle">legal entity finder // v1.0</p>

      <div className="divider" />

      {stage === "loading" ? null : stage === "password" ? (
        <div className="password-area">
          <div className="password-row">
            <span style={{ opacity: passwordError ? 1 : 0.6, fontSize: "0.8rem", color: passwordError ? "#ff4444" : "var(--amber)" }}>
              {passwordError ? "access denied. try again." : "enter password to start"}
            </span>
          </div>
          <div className="input-row" onClick={() => passwordRef.current?.focus()}>
            <span className="prompt">&gt;</span>
            <div style={{ position: "relative", flex: 1 }}>
              <input
                ref={passwordRef}
                type="password"
                value={password}
                onChange={handlePasswordChange}
                onKeyDown={handlePasswordKeyDown}
                autoFocus
                className="hidden-input"
              />
              <span className="password-text">
                {"*".repeat(password.length)}
                <span className="cursor">█</span>
              </span>
            </div>
          </div>
        </div>
      ) : logs.length === 0 ? (
        <div>
          <p className="hint">
            Enter a website URL to find the legal entity. Optionally include a DBA name.
          </p>
          <div className="input-row">
            <span className="prompt">&gt;</span>
            <input
              ref={inputRef}
              className="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. joespizza.com or joespizza.com, DBA Joe's Pizza"
              autoFocus
              disabled={streaming}
            />
            <button
              className="button"
              style={{ opacity: hasWebsite && !streaming ? 1 : 0.4 }}
              onClick={handleStart}
              disabled={!hasWebsite || streaming}
            >
              [ START ]
            </button>
          </div>
        </div>
      ) : (
        <div ref={outputRef} className="output">
          {logs.map((entry, i) => (
            <LogLine key={i} entry={entry} />
          ))}
          {streaming && <span className="cursor">█</span>}
          {done && (
            <>
              <div className="divider" style={{ marginTop: 16 }} />
              <button className="button" onClick={handleReset} autoFocus>
                [ NEW SEARCH ] or press Enter
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface ParsedField {
  key: string;
  value: string;
}

function parseResultText(text: string): { preamble: string; fields: ParsedField[]; rest: string } {
  const lines = text.split("\n");
  const fields: ParsedField[] = [];
  let firstFieldLine = -1;
  let lastFieldLine = -1;

  for (let i = 0; i < lines.length; i++) {
    // Match **Key**: Value  or  - **Key**: Value
    const match = lines[i].match(/^[-*•]?\s*\*\*(.+?)\*\*:\s*(.*)/);
    if (match) {
      if (firstFieldLine === -1) firstFieldLine = i;
      lastFieldLine = i;
      fields.push({ key: match[1].trim(), value: match[2].trim() });
    } else if (fields.length > 0 && lastFieldLine === i - 1 && /^\s*[*-]\s+/.test(lines[i])) {
      // Continuation line (sub-list item like "* url") — append to last field
      const cleaned = lines[i].replace(/^\s*[*-]\s+/, "").trim();
      fields[fields.length - 1].value += (fields[fields.length - 1].value ? ", " : "") + cleaned;
      lastFieldLine = i;
    }
  }

  if (fields.length < 3) {
    return { preamble: text, fields: [], rest: "" };
  }

  const preamble = lines.slice(0, firstFieldLine).join("\n").trim();
  const rest = lines.slice(lastFieldLine + 1).join("\n").trim();
  return { preamble, fields, rest };
}

function CLISection({ label, children, noBorderTop }: { label?: string; children: React.ReactNode; noBorderTop?: boolean }) {
  return (
    <div className={`cli-section${noBorderTop ? " cli-section--no-border" : ""}`}>
      {label && <div className="cli-section__label">{label}</div>}
      {children}
    </div>
  );
}

function ResultText({ text }: { text: string }) {
  const { preamble, fields, rest } = parseResultText(text);

  if (fields.length === 0) {
    return <div className="log-text">{text}</div>;
  }

  return (
    <div style={{ marginTop: 12 }}>
      {preamble && <div className="log-text" style={{ marginBottom: 12 }}>{preamble}</div>}
      <div className="cli-frame">
        {fields.map((field, i) => (
          <CLISection key={i} label={field.key} noBorderTop={i === 0}>
            <div className="cli-section__value">{field.value}</div>
          </CLISection>
        ))}
      </div>
      {rest && <div className="log-text" style={{ marginTop: 12 }}>{rest}</div>}
    </div>
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  switch (entry.type) {
    case "system":
      return <div className="log-system">{entry.text}</div>;
    case "tool-call":
      return (
        <div className="log-tool">
          ⚙ executing: {entry.name}...
        </div>
      );
    case "tool-result":
      return (
        <div className="log-tool-result">
          ✓ {entry.name} complete
        </div>
      );
    case "text":
      return <ResultText text={entry.text} />;
    case "progress":
      return <div className="log-progress">{entry.text}</div>;
    case "error":
      return <div className="log-error">{entry.text}</div>;
  }
}
