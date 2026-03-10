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
}: DoctorEcgChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    <Card className="bg-card border-border rounded-[2.5rem] shadow-sm overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold uppercase tracking-[0.2em] text-violet-400 flex items-center gap-2">
          <MessageCircle className="h-4 w-4" /> Doctor&apos;s Discussion &mdash;
          ECG Insights
        </CardTitle>
        <p className="text-[10px] text-muted-foreground mt-1">
          Discuss your clinical observations about this ECG. The AI will respond
          based on the ECG data
          {patientContext ? " and patient context" : ""}. Your insights will be
          recorded for future analysis sessions.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Chat messages area */}
        <div className="h-[400px] overflow-y-auto space-y-4 mb-4 p-4 rounded-[2rem] bg-secondary/30 border border-border custom-scrollbar">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center gap-6">
              <div className="h-16 w-16 rounded-3xl bg-violet-500/10 flex items-center justify-center text-violet-400">
                <Lightbulb className="h-8 w-8" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-sm font-bold text-foreground/70">
                  Share your clinical observations
                </p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Discuss findings, concerns, or differential diagnoses. The AI
                  will engage with you using the ECG data as context.
                </p>
              </div>

              {/* Suggested prompts */}
              <div className="flex flex-wrap gap-2 max-w-md justify-center">
                {SUGGESTED_PROMPTS.slice(0, 3).map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(prompt)}
                    className="px-3 py-2 rounded-xl bg-violet-500/5 border border-violet-500/10 text-[10px] font-bold text-violet-400 hover:bg-violet-500/10 transition-all"
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
              className={`flex gap-3 ${msg.role === "doctor" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}
            >
              {msg.role === "ai" && (
                <div className="h-8 w-8 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="h-4 w-4 text-violet-400" />
                </div>
              )}
              <div
                className={`max-w-[80%] p-4 rounded-2xl ${
                  msg.role === "doctor"
                    ? "bg-primary text-primary-foreground rounded-tr-lg"
                    : "bg-secondary border border-border rounded-tl-lg"
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-line">
                  {msg.content}
                </p>
                <p
                  className={`text-[8px] mt-2 uppercase tracking-widest ${
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
                <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                  <User className="h-4 w-4 text-primary" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 animate-in fade-in duration-300">
              <div className="h-8 w-8 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-violet-400" />
              </div>
              <div className="bg-secondary border border-border rounded-2xl rounded-tl-lg p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing your observation...
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="flex gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Share your clinical observation or concern about this ECG..."
            rows={2}
            className="flex-1 bg-secondary border border-border rounded-2xl px-5 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/40 transition-all placeholder:text-muted-foreground/50"
          />
          <Button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            className="h-auto px-5 rounded-2xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 shadow-lg shadow-violet-500/20 transition-all self-end"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Context indicator */}
        <div className="mt-3 flex items-center gap-2 text-[9px] text-muted-foreground/50 uppercase tracking-widest">
          <AlertCircle className="h-3 w-3" />
          <span>
            Context: ECG analysis data
            {patientContext ? " + patient symptoms" : ""} &middot; Conversation
            saved for future reference
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
