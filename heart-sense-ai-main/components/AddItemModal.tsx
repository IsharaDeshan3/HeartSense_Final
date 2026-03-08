"use client";

import { useState, useEffect } from "react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { Mic, MicOff, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AddItemModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onAdd: (value: string) => void;
  readonly categoryLabel: string;
}

export default function AddItemModal({ isOpen, onClose, onAdd, categoryLabel }: AddItemModalProps) {
  const [inputValue, setInputValue] = useState("");
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition();

  useEffect(() => {
    if (transcript) {
      setInputValue(transcript);
    }
  }, [transcript]);

  const handleAdd = () => {
    if (inputValue.trim()) {
      onAdd(inputValue.trim());
      setInputValue("");
      resetTranscript();
      onClose();
    }
  };

  const handleStartListening = () => {
    resetTranscript();
    SpeechRecognition.startListening({ language: "en-US", continuous: true });
  };

  const handleStopListening = () => {
    SpeechRecognition.stopListening();
  };

  const handleClose = () => {
    setInputValue("");
    resetTranscript();
    SpeechRecognition.stopListening();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="glass rounded-2xl shadow-2xl max-w-md w-full border border-white/10 overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-black uppercase tracking-widest text-foreground">
              Add {categoryLabel}
            </h2>
            <button
              onClick={handleClose}
              className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Input */}
            <div>
              <label htmlFor="add-item-textarea" className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                Enter item details
              </label>
              <textarea
                id="add-item-textarea"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={`Type or speak to add ${categoryLabel.toLowerCase()}...`}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 resize-none transition-all"
                rows={4}
              />
            </div>

            {/* Voice Controls */}
            {browserSupportsSpeechRecognition ? (
              <div className="flex items-center gap-3">
                <Button
                  onClick={listening ? handleStopListening : handleStartListening}
                  variant={listening ? "destructive" : "default"}
                  className={`flex-1 h-11 rounded-xl font-bold uppercase tracking-wider text-xs transition-all ${
                    listening ? "animate-pulse" : ""
                  }`}
                >
                  {listening ? (
                    <MicOff className="h-4 w-4 mr-2" />
                  ) : (
                    <Mic className="h-4 w-4 mr-2" />
                  )}
                  {listening ? "Stop Recording" : "Start Voice Input"}
                </Button>
                {transcript && (
                  <Button
                    onClick={() => {
                      resetTranscript();
                      setInputValue("");
                    }}
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 rounded-xl border-white/10"
                    title="Clear"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ) : (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                <p className="text-xs text-yellow-400">
                  Voice input is not supported in your browser. Please use typing instead.
                </p>
              </div>
            )}

            {/* Listening indicator */}
            {listening && (
              <div className="flex items-center gap-2 text-xs text-primary font-bold">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                Listening...
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-6">
            <Button
              onClick={handleClose}
              variant="outline"
              className="flex-1 h-11 rounded-xl border-white/10 font-bold uppercase tracking-wider text-xs"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={!inputValue.trim()}
              className="flex-1 h-11 rounded-xl font-bold uppercase tracking-wider text-xs glow-primary"
            >
              Add Item
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
