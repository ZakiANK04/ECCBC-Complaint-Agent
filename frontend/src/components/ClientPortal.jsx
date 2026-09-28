import { useState, useRef, useEffect } from "react";
import {
  Send,
  Loader2,
  Check,
  CheckCheck,
  FileText,
  Download,
  Paperclip,
  Smile,
  Bot,
  RefreshCw,
  AlertCircle,
  Clock,
  Sparkles
} from "lucide-react";
import { api } from "../api";
import Badge from "./Badge";

const SUGGESTIONS = [
  { label: "🍾 Bouteilles cassées", text: "J'ai reçu ce matin une palette de Coca-Cola 1L avec 6 bouteilles cassées et du liquide partout." },
  { label: "⏱️ Retard de livraison", text: "Notre livraison prévue à 8h à Rouiba n'est toujours pas arrivée, nos rayons sont vides." },
  { label: "📦 Facturation / Manquant", text: "Erreur sur le bon de livraison: facturé pour 20 packs de Sprite mais reçu seulement 15." },
  { label: "🇩🇿 Darija (سلعة فاسدة)", text: "Salam, la commande li b3athouha lyoum lmagaza fiha 4 qra3i fassdin w saylin." },
];

export default function ClientPortal() {
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      sender: "bot",
      text: "Bonjour ! Bienvenue au service client de l'Equatorial Coca-Cola Bottling Company (ECCBC - Division Fruital Rouiba).\n\nAvez-vous rencontré un problème lors de votre livraison ou avec vos produits ? Décrivez-nous votre réclamation (en Français, Anglais ou Darija), nous la prenons en charge immédiatement.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleSend(e) {
    if (e) e.preventDefault();
    const textToSend = input.trim();
    if (!textToSend || loading) return;

    const userMessageId = "msg-" + Date.now();
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // 1. Add user message with "sent" (single check)
    const userMessage = {
      id: userMessageId,
      sender: "user",
      text: textToSend,
      timestamp: now,
      status: "sent", // 'sent' -> 'delivered' -> 'read'
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setError(null);
    setLoading(true);

    // Simulate network delivery to bot (sent -> delivered)
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === userMessageId ? { ...m, status: "delivered" } : m))
      );
    }, 400);

    try {
      const ticket = await api.submitComplaint(textToSend);

      // Mark user message as read (blue double ticks)
      setMessages((prev) =>
        prev.map((m) => (m.id === userMessageId ? { ...m, status: "read" } : m))
      );

      // Add bot response with ticket details attached
      const botResponse = {
        id: "bot-" + Date.now(),
        sender: "bot",
        text: ticket.client_reply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        ticket: ticket,
      };

      setMessages((prev) => [...prev, botResponse]);
    } catch (err) {
      setError(err.message);
      setMessages((prev) => [
        ...prev,
        {
          id: "err-" + Date.now(),
          sender: "bot",
          isError: true,
          text: "Désolé, une erreur est survenue lors de l'enregistrement de votre réclamation. Veuillez réessayer ou contacter le support technique.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function applySuggestion(text) {
    setInput(text);
    inputRef.current?.focus();
  }

  function resetChat() {
    setMessages([
      {
        id: "welcome-" + Date.now(),
        sender: "bot",
        text: "Nouvelle session initialisée. Comment pouvons-nous vous assister ?",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setError(null);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 md:py-8">
      {/* Messenger / WhatsApp Chat Container */}
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden flex flex-col h-[740px] max-h-[85vh]">
        {/* Chat Window Header */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-5 py-3.5 flex items-center justify-between shadow-sm z-10">
          <div className="flex items-center gap-3.5">
            <div className="relative">
              <img
                src="/eccbc-logo.png"
                alt="ECCBC Support"
                className="w-11 h-11 rounded-full object-contain bg-white p-0.5 border-2 border-brand-red/80 shadow-sm"
              />
              <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-900 rounded-full"></span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base tracking-tight leading-tight">
                  ECCBC Support Client
                </h3>
                <span className="text-[10px] bg-brand-red text-white font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  IA Agent
                </span>
              </div>
              <p className="text-xs text-slate-300 flex items-center gap-1.5 mt-0.5">
                {loading ? (
                  <span className="text-emerald-400 font-medium animate-pulse flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span>
                    en train d'écrire...
                  </span>
                ) : (
                  <>
                    <span className="w-2 h-2 bg-emerald-400 rounded-full inline-block"></span>
                    En ligne &bull; Division Fruital Rouiba
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={resetChat}
              title="Réinitialiser la conversation"
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-700/60 rounded-xl transition-colors"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        {/* Chat Message Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-[#F8F9FB] chat-scroll relative">
          {/* Subtle Background pattern hint */}
          <div className="text-center my-1">
            <span className="bg-slate-200/80 text-slate-600 text-[11px] font-medium px-3 py-1 rounded-full shadow-2xs">
              Aujourd'hui &bull; Canal Sécurisé ECCBC
            </span>
          </div>

          {messages.map((msg) => {
            const isUser = msg.sender === "user";
            return (
              <div
                key={msg.id}
                className={`flex items-end gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
              >
                {/* Bot Avatar */}
                {!isUser && (
                  <img
                    src="/eccbc-logo.png"
                    alt="Bot"
                    className="w-8 h-8 rounded-full bg-white p-0.5 border border-slate-200 shrink-0 shadow-xs mb-1"
                  />
                )}

                {/* Message Bubble */}
                <div
                  className={`max-w-[85%] md:max-w-[75%] rounded-2xl p-4 shadow-sm transition-all ${
                    isUser
                      ? "bg-brand-red text-white rounded-br-xs"
                      : msg.isError
                      ? "bg-red-50 text-red-800 border border-red-200 rounded-bl-xs"
                      : "bg-white text-slate-800 border border-slate-200/80 rounded-bl-xs"
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>

                  {/* Attached Ticket Card (Telegram / WhatsApp Style Rich Attachment) */}
                  {msg.ticket && (
                    <div className="mt-3.5 pt-3 border-t border-slate-100 bg-slate-50/80 rounded-xl p-3.5 text-slate-700 space-y-2.5">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                        <span className="text-xs font-bold text-brand-red flex items-center gap-1.5">
                          <FileText size={15} />
                          Ticket #{msg.ticket.ticket_id}
                        </span>
                        <div className="flex gap-1.5">
                          <Badge value={msg.ticket.urgency} />
                          <Badge value={msg.ticket.sentiment} />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Problème</span>
                          <span className="font-medium text-slate-800">{msg.ticket.problem_type}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Routage Département</span>
                          <span className="font-medium text-slate-800">{msg.ticket.department_label}</span>
                        </div>
                      </div>

                      {msg.ticket.summary && (
                        <p className="text-xs text-slate-600 italic bg-white p-2 rounded-lg border border-slate-200/60">
                          "{msg.ticket.summary}"
                        </p>
                      )}

                      <div className="pt-1 flex items-center justify-between gap-3">
                        <span className="text-[11px] text-slate-500 truncate">
                          Notifié: {msg.ticket.department_email}
                        </span>
                        <a
                          href={api.ticketPdfUrl(msg.ticket.ticket_id)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 bg-brand-red hover:bg-brand-red-dark text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-xs transition-colors shrink-0"
                        >
                          <Download size={13} />
                          PDF Officiel
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Message Meta / Timestamp / Status Ticks */}
                  <div
                    className={`flex items-center justify-end gap-1 mt-1.5 text-[11px] ${
                      isUser ? "text-white/80" : "text-slate-400"
                    }`}
                  >
                    <span>{msg.timestamp}</span>
                    {isUser && (
                      <span className="ml-0.5">
                        {msg.status === "sent" && <Check size={14} className="text-white/70" />}
                        {msg.status === "delivered" && (
                          <CheckCheck size={14} className="text-white/70" />
                        )}
                        {msg.status === "read" && (
                          <CheckCheck size={14} className="text-sky-300 stroke-[2.5]" />
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Typing Indicator Bubble (WhatsApp/Telegram Style) */}
          {loading && (
            <div className="flex items-end gap-2.5 justify-start animate-fade-in">
              <img
                src="/eccbc-logo.png"
                alt="Bot"
                className="w-8 h-8 rounded-full bg-white p-0.5 border border-slate-200 shrink-0 shadow-xs mb-1"
              />
              <div className="bg-white border border-slate-200/80 rounded-2xl rounded-bl-xs px-4 py-3 shadow-sm flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-brand-red typing-dot-1"></span>
                <span className="w-2 h-2 rounded-full bg-brand-red typing-dot-2"></span>
                <span className="w-2 h-2 rounded-full bg-brand-red typing-dot-3"></span>
                <span className="text-xs text-slate-500 font-medium ml-1.5">
                  Analyse & rédaction en cours...
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggestions Bar */}
        <div className="px-4 py-2 bg-slate-100/80 border-t border-slate-200 flex items-center gap-2 overflow-x-auto text-xs">
          <span className="text-slate-400 font-medium shrink-0 flex items-center gap-1 text-[11px]">
            <Sparkles size={13} className="text-amber-500" /> Suggestions:
          </span>
          {SUGGESTIONS.map((sug, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => applySuggestion(sug.text)}
              disabled={loading}
              className="bg-white hover:bg-slate-50 active:scale-95 text-slate-700 px-3 py-1.5 rounded-full border border-slate-200/80 font-medium shrink-0 shadow-2xs transition-all cursor-pointer hover:border-brand-red/40"
            >
              {sug.label}
            </button>
          ))}
        </div>

        {/* Input Bar (WhatsApp / Messenger Style) */}
        <div className="p-3.5 bg-white border-t border-slate-200">
          {error && (
            <div className="mb-2.5 flex items-center gap-2 text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-100">
              <AlertCircle size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <form onSubmit={handleSend} className="flex items-end gap-2.5">
            <div className="flex-1 relative flex items-center bg-slate-100/90 hover:bg-slate-100 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-red/30 focus-within:border-brand-red border border-slate-200 rounded-2xl transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder="Écrivez votre réclamation ici (Français, English, Darija)..."
                disabled={loading}
                className="w-full bg-transparent px-4 py-3 text-sm text-slate-800 focus:outline-none resize-none max-h-32 placeholder:text-slate-400"
                style={{ minHeight: "44px" }}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="h-11 w-11 rounded-full bg-brand-red hover:bg-brand-red-dark disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-all shadow-md shrink-0 active:scale-95"
              title="Envoyer (Entrée)"
            >
              {loading ? (
                <Loader2 size={19} className="animate-spin" />
              ) : (
                <Send size={18} className="translate-x-0.5" />
              )}
            </button>
          </form>
          <div className="flex justify-between items-center px-2 pt-1 text-[11px] text-slate-400">
            <span>Appuyez sur Entrée pour envoyer, Maj+Entrée pour saut de ligne</span>
            <span>ECCBC &bull; IA Multilingue</span>
          </div>
        </div>
      </div>
    </div>
  );
}
