"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Check, AlertCircle, History, Shield, Heart, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import AddItemModal from "./AddItemModal";

export interface SymptomData {
  value: string;
  status: "pending" | "confirmed" | "approved";
}

export interface CurrentState {
  symptoms: Record<string, SymptomData>;
  medical_history: Record<string, SymptomData>;
  allergies: Record<string, SymptomData>;
  risk_factors: Record<string, SymptomData>;
}

interface ApprovalEditorProps {
  readonly sessionId: string;
  readonly initialState: CurrentState;
  readonly onStateChange?: (next: CurrentState) => void;
  readonly onSave?: (finalState: CurrentState) => void;
  readonly onClose?: () => void;
}

const categoryConfig = {
  symptoms: { label: "Symptoms", icon: AlertCircle, color: "orange" },
  medical_history: { label: "Medical History", icon: History, color: "blue" },
  allergies: { label: "Allergies", icon: Heart, color: "red" },
  risk_factors: { label: "Risk Factors", icon: Shield, color: "primary" },
} as const;

export default function ApprovalEditor({ sessionId, initialState, onStateChange, onSave, onClose }: ApprovalEditorProps) {
  const [state, setState] = useState<CurrentState>(initialState);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<keyof CurrentState | null>(null);

  const categories = useMemo(() => (
    [
      { key: "symptoms", label: "Symptoms" },
      { key: "medical_history", label: "Medical History" },
      { key: "allergies", label: "Allergies" },
      { key: "risk_factors", label: "Risk Factors" },
    ] as const
  ), []);

  const updateLocal = (next: CurrentState) => {
    setState(next);
    onStateChange?.(next);
  };

  const setItemValue = (category: keyof CurrentState, key: string, value: string) => {
    updateLocal({
      ...state,
      [category]: {
        ...state[category],
        [key]: { ...state[category][key], value },
      },
    });
  };

  const acceptItem = (category: keyof CurrentState, key: string) => {
    const item = state[category][key];
    updateLocal({
      ...state,
      [category]: {
        ...state[category],
        [key]: { ...item, status: "approved" },
      },
    });
  };

  const removeItem = (category: keyof CurrentState, key: string) => {
    const { [key]: _, ...rest } = state[category];
    updateLocal({
      ...state,
      [category]: rest as Record<string, SymptomData>,
    });
  };

  // Alias for semantic clarity - reject is same as remove
  const rejectItem = removeItem;

  const handleOpenModal = (category: keyof CurrentState) => {
    setActiveCategory(category);
    setIsModalOpen(true);
  };

  const handleAddItem = (value: string) => {
    if (activeCategory && value.trim()) {
      const newKey = `${activeCategory}_${Date.now()}`;
      updateLocal({
        ...state,
        [activeCategory]: {
          ...state[activeCategory],
          [newKey]: {
            value: value.trim(),
            status: "approved",
          },
        },
      });
    }
  };

  const handleSave = () => {
    try {
      localStorage.setItem("nlp.sessionId", sessionId);
      localStorage.setItem("nlp.currentState", JSON.stringify(state));
    } catch {}
    
    // Call onSave with final state (parent will extract approved items as arrays)
    if (onSave) {
      onSave(state);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black uppercase tracking-widest text-foreground">
            Review & Edit
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Session: <span className="font-mono text-primary">{sessionId.slice(0, 12)}...</span>
          </p>
        </div>
        <div className="flex gap-2">
          {onClose && (
            <Button
              onClick={onClose}
              variant="outline"
              className="h-10 px-4 rounded-xl border-white/10 font-bold uppercase tracking-wider text-xs"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}
          <Button
            onClick={handleSave}
            className="h-10 px-4 rounded-xl font-bold uppercase tracking-wider text-xs glow-primary"
          >
            <Check className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {categories.map(({ key, label }) => {
          const config = categoryConfig[key];
          const Icon = config.icon;
          const cat = state[key];
          const approvedEntries = Object.entries(cat || {}).filter(([_, v]) => v.status === "approved");
          const pendingEntries = Object.entries(cat || {}).filter(([_, v]) => v.status !== "approved");
          
          return (
            <Card key={key} className="glass border-white/5 bg-white/[0.02] rounded-2xl overflow-hidden">
              <CardContent className="p-4">
                {/* Category Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className={`h-8 w-8 rounded-lg bg-${config.color}-500/10 flex items-center justify-center`}>
                      <Icon className={`h-4 w-4 text-${config.color}-500`} />
                    </div>
                    <h3 className="text-sm font-black uppercase tracking-widest">{label}</h3>
                  </div>
                  <Button
                    onClick={() => handleOpenModal(key)}
                    size="sm"
                    variant="outline"
                    className="h-8 px-3 rounded-lg border-white/10 text-xs font-bold"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>

                {/* Pending Items */}
                {pendingEntries.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-yellow-400 mb-2">
                      Pending Review
                    </p>
                    <div className="space-y-2">
                      {pendingEntries.map(([k, v]) => (
                        <div 
                          key={k} 
                          className="p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20"
                        >
                          <input
                            value={v.value}
                            onChange={(e) => setItemValue(key, k, e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 mb-2"
                          />
                          <div className="flex gap-2">
                            <Button
                              onClick={() => acceptItem(key, k)}
                              size="sm"
                              className="h-7 px-3 rounded-lg text-[10px] font-bold"
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Approve
                            </Button>
                            <Button
                              onClick={() => rejectItem(key, k)}
                              size="sm"
                              variant="destructive"
                              className="h-7 px-3 rounded-lg text-[10px] font-bold"
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              Reject
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Approved Items */}
                {approvedEntries.length > 0 ? (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-primary mb-2">
                      ✓ Approved
                    </p>
                    <div className="space-y-2">
                      {approvedEntries.map(([k, v]) => (
                        <div 
                          key={k} 
                          className="p-3 rounded-xl bg-primary/5 border border-primary/20"
                        >
                          <input
                            value={v.value}
                            onChange={(e) => setItemValue(key, k, e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 mb-2"
                          />
                          <Button
                            onClick={() => removeItem(key, k)}
                            size="sm"
                            variant="outline"
                            className="h-7 px-3 rounded-lg text-[10px] font-bold border-destructive/30 text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : pendingEntries.length === 0 && (
                  <p className="text-xs italic text-muted-foreground/50 py-4 text-center">
                    No items in this category
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add Item Modal */}
      <AddItemModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setActiveCategory(null);
        }}
        onAdd={handleAddItem}
        categoryLabel={activeCategory ? categoryConfig[activeCategory].label : ""}
      />
    </div>
  );
}
