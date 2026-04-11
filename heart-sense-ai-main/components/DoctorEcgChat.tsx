"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send,
  MessageCircle,
  Bot,
  User,
  Loader2,
  Lightbulb,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EcgAnalysisData } from "./EcgAnalysisResult";

interface ChatMessage {
  id: string;
  role: "doctor" | "ai";
  content: string;
  timestamp: Date;
}

interface DoctorEcgChatProps {
  analysisData: EcgAnalysisData;
  patientId?: string;
  sessionId?: string;
  patientContext?: string;
  className?: string;
  autoFocusInput?: boolean;
}

const SUGGESTED_PROMPTS = [
  "What patterns should I watch for given these findings?",
  "Could this rhythm indicate a more serious underlying condition?",
  "What follow-up tests would you recommend?",
  "Explain the ST segment changes in detail",
  "How do these findings correlate with the patient's symptoms?",
];

export function DoctorEcgChat({
  analysisData,
  patientId,
  sessionId,
  patientContext,
  className,
  autoFocusInput = false,
}: DoctorEcgChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (autoFocusInput) {
      inputRef.current?.focus();
    }
  }, [autoFocusInput]);

  const sendMessage = async (content?: string) => {
    const messageText = content || input.trim();
    if (!messageText || isLoading) return;

    const doctorMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "doctor",
      content: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, doctorMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/ecg/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText,
          conversationHistory: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          ecgAnalysis: analysisData,
          patientId,
          sessionId,
          patientContext,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get response");
      }

      const aiMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "ai",
        content: data.response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error: any) {
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "ai",
        content: `Unable to process your query: ${error.message}. Please try again.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div
      className={`h-full flex flex-col bg-card border border-border rounded-[2.5rem] overflow-hidden shadow-sm ${className || ""}`}
    >
      {/* Header */}
      <div className="px-5 md:px-6 py-5 md:py-6 border-b border-border shrink-0">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400">
            <MessageCircle className="h-4 w-4" />
          </div>
          <h3 className="text-base lg:text-lg font-black tracking-tight text-foreground/90">
            Clinical Discussion
          </h3>
        </div>
        <p className="text-xs lg:text-sm text-muted-foreground mt-2 leading-snug">
          Discuss findings, concerns, or differential diagnoses with AI
          assistance.
        </p>
      </div>

      {/* Chat messages area */}
      <div className="flex-1 overflow-y-auto space-y-4 p-4 md:p-5 custom-scrollbar">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-6">
            <div className="h-16 w-16 rounded-3xl bg-violet-500/10 flex items-center justify-center text-violet-400">
              <Lightbulb className="h-8 w-8" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-base lg:text-lg font-bold text-foreground/70">
                Share your observations
              </p>
              <p className="text-sm lg:text-base text-muted-foreground max-w-xs leading-snug">
                Ask questions about the findings shown in the ECG.
              </p>
            </div>

            {/* Suggested prompts - larger buttons */}
            <div className="flex flex-col gap-2 w-full max-w-sm">
              {SUGGESTED_PROMPTS.slice(0, 3).map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(prompt)}
                  className="px-4 py-3 rounded-xl bg-violet-500/5 border border-violet-500/20 text-sm lg:text-base font-semibold text-violet-400 hover:bg-violet-500/10 hover:border-violet-500/30 transition-all text-left leading-snug"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300 ${
              msg.role === "doctor" ? "justify-end" : "justify-start"
            }`}
          >
            {msg.role === "ai" && (
              <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0 mt-1 flex-none">
                <Bot className="h-4 w-4 text-violet-400" />
              </div>
            )}
            <div
              className={`max-w-[80%] p-4 md:p-5 rounded-2xl ${
                msg.role === "doctor"
                  ? "bg-primary text-primary-foreground rounded-tr-lg"
                  : "bg-secondary border border-border rounded-tl-lg"
              }`}
            >
              <p className="text-sm lg:text-base leading-relaxed whitespace-pre-line">
                {msg.content}
              </p>
              <p
                className={`text-[8px] lg:text-[9px] mt-2 uppercase tracking-widest ${
                  msg.role === "doctor"
                    ? "text-primary-foreground/50"
                    : "text-muted-foreground"
                }`}
              >
                {msg.timestamp.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            {msg.role === "doctor" && (
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1 flex-none">
                <User className="h-4 w-4 text-primary" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 animate-in fade-in duration-300">
            <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0 flex-none">
              <Bot className="h-4 w-4 text-violet-400" />
            </div>
            <div className="bg-secondary border border-border rounded-2xl rounded-tl-lg p-4 md:p-5">
              <div className="flex items-center gap-2 text-sm lg:text-base text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing...
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border p-4 md:p-5 shrink-0 space-y-3">
        <div className="flex gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about findings or recommendations..."
            rows={2}
            className="flex-1 bg-secondary border border-border rounded-2xl px-5 py-3 text-sm lg:text-base resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/40 transition-all placeholder:text-muted-foreground/50"
          />
          <Button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            className="h-auto px-4 md:px-5 rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 shadow-lg shadow-violet-500/20 transition-all self-end shrink-0"
            size="sm"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Context indicator */}
        <div className="flex items-center gap-2 text-[8px] lg:text-[9px] text-muted-foreground/50 uppercase tracking-widest">
          <AlertCircle className="h-3 w-3" />
          <span>
            Context: ECG + analysis{patientContext ? " + symptoms" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
