import { useState, useRef, useCallback } from "react";

const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

const systemPrompts = {
  email: `You are an expert email writer. The user will give you rough spoken dictation. Your job is to:
1. Format it as a polished, professional email
2. Add appropriate greeting and sign-off if not mentioned
3. Fix grammar, filler words (um, uh, like), and run-on sentences
4. Keep the tone natural and human — not stiff or corporate
5. Output ONLY the finished email text, nothing else. No explanations. No markdown.`,
  text: `You are a helpful assistant that cleans up spoken text messages. The user will give you rough spoken dictation. Your job is to:
1. Format it as a clean, natural text message
2. Remove filler words (um, uh, like, you know) 
3. Fix punctuation and capitalization appropriately for texting
4. Keep it conversational and concise
5. Output ONLY the finished text message, nothing else. No explanations.`,
};

export default function App() {
  const [mode, setMode] = useState("email");
  const [isListening, setIsListening] = useState(false);
  const [rawText, setRawText] = useState("");
  const [polishedText, setPolishedText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [copyState, setCopyState] = useState("idle");
  const [error, setError] = useState("");
  const [interimText, setInterimText] = useState("");
  const [bars] = useState(() => Array.from({ length: 24 }, (_, i) => i));

  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef("");
  const animFrameRef = useRef(null);
  const [waveHeights, setWaveHeights] = useState(() => Array(24).fill(4));

  const animateWave = useCallback((listening) => {
    if (!listening) {
      setWaveHeights(Array(24).fill(4));
      return;
    }
    const animate = () => {
      setWaveHeights(prev => prev.map((_, i) => {
        const center = 12;
        const dist = Math.abs(i - center) / center;
        const max = (1 - dist * 0.5) * 36;
        return Math.max(4, Math.random() * max);
      }));
      animFrameRef.current = setTimeout(() => animate(), 100);
    };
    animate();
  }, []);

  const startListening = useCallback(() => {
    setError("");
    setRawText("");
    setPolishedText("");
    setInterimText("");
    finalTranscriptRef.current = "";

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition not supported. Use Chrome on Android.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      animateWave(true);
    };

    recognition.onresult = (event) => {
      let interim = "";
      let finalChunk = "";
      for (let i = 0; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalChunk += t;
        else interim += t;
      }
      if (finalChunk) {
        const newText = (finalTranscriptRef.current + " " + finalChunk).trim();
        finalTranscriptRef.current = newText;
        setRawText(newText);
      }
      setInterimText(interim);
    };

    recognition.onerror = (e) => {
      if (e.error !== "aborted" && e.error !== "no-speech") setError(`Mic error: ${e.error}`);
      stopListening();
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimText("");
      clearTimeout(animFrameRef.current);
      animateWave(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [animateWave]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
    clearTimeout(animFrameRef.current);
    animateWave(false);
  }, [animateWave]);

  const polishWithClaude = async () => {
    const text = rawText.trim();
    if (!text) return;
    setIsProcessing(true);
    setPolishedText("");
    setError("");

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-allow-browser": "true",
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 1000,
          system: systemPrompts[mode],
          messages: [{ role: "user", content: text }],
        }),
      });
      const data = await res.json();
      setPolishedText(data.content?.[0]?.text || "");
    } catch {
      setError("Failed to reach Claude API. Check your API key in Vercel settings.");
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = () => {
    const text = polishedText || rawText;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    });
  };

  const reset = () => {
    stopListening();
    setRawText("");
    setPolishedText("");
    setInterimText("");
    setError("");
    finalTranscriptRef.current = "";
  };

  const hasContent = rawText.trim().length > 0;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#1a1a20",
      fontFamily: "'Georgia', 'Times New Roman', serif",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "36px 20px 60px",
      color: "#f0ebe0",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <div style={{
          fontSize: "10px", letterSpacing: "0.3em", color: "#c8a96e",
          textTransform: "uppercase", marginBottom: "8px",
          fontFamily: "'Courier New', monospace",
        }}>Voice Composer</div>
        <h1 style={{
          margin: 0, fontSize: "clamp(26px, 7vw, 40px)",
          fontWeight: 400, letterSpacing: "-0.02em", color: "#f0ebe0",
        }}>Speak. Send.</h1>
        <p style={{ margin: "8px 0 0", fontSize: "13px", color: "#a09878", fontStyle: "italic" }}>
          Voice → AI polish → Ready to send
        </p>
      </div>

      {/* Mode Toggle */}
      <div style={{
        display: "flex", marginBottom: "28px",
        border: "1px solid #555040", borderRadius: "6px", overflow: "hidden",
      }}>
        {["email", "text"].map(m => (
          <button key={m} onClick={() => { setMode(m); setPolishedText(""); }}
            style={{
              padding: "11px 30px",
              background: mode === m ? "#c8a96e" : "transparent",
              color: mode === m ? "#0a0a0f" : "#b0a888",
              border: "none", cursor: "pointer",
              fontSize: "12px", letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontFamily: "'Courier New', monospace",
              fontWeight: mode === m ? 700 : 400,
              transition: "all 0.2s",
            }}>
            {m === "email" ? "✉ Email" : "💬 Text"}
          </button>
        ))}
      </div>

      {/* Waveform + Mic */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "24px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: "3px",
          height: "44px", marginBottom: "18px",
          opacity: isListening ? 1 : 0.2, transition: "opacity 0.3s",
        }}>
          {bars.map(i => (
            <div key={i} style={{
              width: "3px",
              height: `${waveHeights[i] || 4}px`,
              background: "#c8a96e",
              borderRadius: "2px",
              transition: "height 0.09s ease",
            }} />
          ))}
        </div>

        <button
          onClick={isListening ? stopListening : startListening}
          style={{
            width: "82px", height: "82px", borderRadius: "50%",
            border: `2px solid ${isListening ? "#c8a96e" : "#666050"}`,
            background: isListening
              ? "radial-gradient(circle, #c8a96e22, #c8a96e08)"
              : "#2a2820",
            cursor: "pointer", fontSize: "30px",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: isListening ? "0 0 32px #c8a96e55" : "none",
            transition: "all 0.2s",
            WebkitTapHighlightColor: "transparent",
          }}>
          {isListening ? "⏹" : "🎙"}
        </button>

        <div style={{
          marginTop: "10px", fontSize: "11px", letterSpacing: "0.15em",
          color: isListening ? "#c8a96e" : "#a09070",
          fontFamily: "'Courier New', monospace", textTransform: "uppercase",
        }}>
          {isListening ? "● Listening..." : rawText ? "Tap to add more" : "Tap to speak"}
        </div>
      </div>

      {/* Transcript */}
      <div style={{
        width: "100%", maxWidth: "520px",
        background: "#22222a", border: "1px solid #444038",
        borderRadius: "8px", padding: "18px", marginBottom: "16px", minHeight: "90px",
      }}>
        <div style={{
          fontSize: "9px", letterSpacing: "0.25em", color: "#9a9080",
          textTransform: "uppercase", fontFamily: "'Courier New', monospace", marginBottom: "10px",
        }}>Raw Transcript</div>
        <div style={{
          fontSize: "15px", lineHeight: "1.7",
          color: rawText ? "#f0ebe0" : "#706858",
          fontStyle: rawText ? "normal" : "italic",
        }}>
          {rawText || "Your spoken words appear here..."}
          {interimText && <span style={{ color: "#6a6050", fontStyle: "italic" }}> {interimText}</span>}
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: "10px", width: "100%", maxWidth: "520px", marginBottom: "16px" }}>
        <button
          onClick={polishWithClaude}
          disabled={!hasContent || isProcessing || isListening}
          style={{
            flex: 1, padding: "14px",
            background: hasContent && !isProcessing && !isListening ? "#c8a96e" : "#2e2c26",
            color: hasContent && !isProcessing && !isListening ? "#0a0a0f" : "#706858",
            border: "none", borderRadius: "6px",
            fontSize: "12px", letterSpacing: "0.1em", textTransform: "uppercase",
            fontFamily: "'Courier New', monospace", fontWeight: 700,
            cursor: hasContent && !isProcessing && !isListening ? "pointer" : "not-allowed",
            transition: "all 0.2s",
            WebkitTapHighlightColor: "transparent",
          }}>
          {isProcessing ? "✦ Polishing..." : `✦ Polish as ${mode}`}
        </button>
        <button onClick={reset} style={{
          padding: "14px 18px", background: "transparent", color: "#a09070",
          border: "1px solid #555040", borderRadius: "6px",
          fontSize: "12px", cursor: "pointer", letterSpacing: "0.1em",
          textTransform: "uppercase", fontFamily: "'Courier New', monospace",
          WebkitTapHighlightColor: "transparent",
        }}>Reset</button>
      </div>

      {/* Polished Output */}
      {(isProcessing || polishedText) && (
        <div style={{
          width: "100%", maxWidth: "520px",
          background: "#1a2015", border: "1px solid #3a5025",
          borderRadius: "8px", padding: "18px", marginBottom: "14px",
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: "12px",
          }}>
            <div style={{
              fontSize: "9px", letterSpacing: "0.25em", color: "#6a8a50",
              textTransform: "uppercase", fontFamily: "'Courier New', monospace",
            }}>✓ AI Polished</div>
            {polishedText && (
              <button onClick={copyToClipboard} style={{
                padding: "6px 14px",
                background: copyState === "copied" ? "#4a7a30" : "transparent",
                color: copyState === "copied" ? "#c0e0a0" : "#6a8a50",
                border: "1px solid #3a5a20", borderRadius: "4px",
                fontSize: "11px", cursor: "pointer",
                fontFamily: "'Courier New', monospace",
                WebkitTapHighlightColor: "transparent",
              }}>
                {copyState === "copied" ? "✓ Copied!" : "Copy"}
              </button>
            )}
          </div>
          {isProcessing
            ? <div style={{ color: "#5a6a40", fontStyle: "italic", fontSize: "14px" }}>Cleaning up your message...</div>
            : <div style={{ fontSize: "15px", lineHeight: "1.9", color: "#d0e8b8", whiteSpace: "pre-wrap" }}>{polishedText}</div>
          }
        </div>
      )}

      {error && (
        <div style={{
          width: "100%", maxWidth: "520px",
          padding: "14px 16px", background: "#1a0a0a",
          border: "1px solid #3a1818", borderRadius: "6px",
          color: "#c87070", fontSize: "13px",
          fontFamily: "'Courier New', monospace",
        }}>⚠ {error}</div>
      )}
    </div>
  );
}
