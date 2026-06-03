import { useState } from "react";
import { Box, Play, Square, Wrench, Globe, ExternalLink, RefreshCw, Server, Cpu } from "lucide-react";

export default function OfficeView() {
  const [serverStatus, setServerStatus] = useState<"stopped" | "running">("stopped");
  const [port, setPort] = useState("3000");
  const [adapter, setAdapter] = useState("threejs");

  return (
    <div className="flex flex-col h-full bg-[#0D0D0D]">
      <div className="px-6 py-5 border-b border-white/5">
        <h1 className="text-xl font-semibold text-white mb-1">Hermes Office</h1>
        <p className="text-sm text-white/40">3D visual interface and adapter management</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Dev Server */}
          <div className="p-6 rounded-xl bg-[#1A1A1A] border border-white/5">
            <div className="flex items-center gap-3 mb-5">
              <div className={`w-2.5 h-2.5 rounded-full ${serverStatus === "running" ? "bg-green-400 animate-pulse" : "bg-white/20"}`} />
              <h3 className="text-sm font-medium text-white">Dev Server</h3>
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${serverStatus === "running" ? "bg-green-400/10 text-green-400" : "bg-white/5 text-white/30"}`}>
                {serverStatus === "running" ? "Running" : "Stopped"}
              </span>
            </div>

            <div className="flex items-center gap-2 mb-5">
              <span className="text-xs text-white/30">Port:</span>
              <input
                value={port}
                onChange={e => setPort(e.target.value)}
                className="w-20 bg-[#0D0D0D] border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-[#0A84FF]/50"
              />
              {serverStatus === "running" && (
                <a href={`http://localhost:${port}`} target="_blank" className="flex items-center gap-1 text-[11px] text-[#0A84FF] hover:underline ml-2">
                  <ExternalLink size={11} /> localhost:{port}
                </a>
              )}
            </div>

            <div className="flex gap-2">
              {serverStatus === "stopped" ? (
                <button onClick={() => setServerStatus("running")} className="flex items-center gap-2 px-4 py-2 bg-[#0A84FF] text-white rounded-lg text-sm font-medium hover:bg-[#0A84FF]/90 transition-colors">
                  <Play size={14} /> Start Server
                </button>
              ) : (
                <button onClick={() => setServerStatus("stopped")} className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/30 transition-colors">
                  <Square size={14} /> Stop Server
                </button>
              )}
              <button className="flex items-center gap-2 px-4 py-2 bg-white/5 text-white/40 rounded-lg text-sm hover:bg-white/10 transition-colors">
                <RefreshCw size={14} /> Restart
              </button>
            </div>
          </div>

          {/* Adapter */}
          <div className="p-6 rounded-xl bg-[#1A1A1A] border border-white/5">
            <div className="flex items-center gap-3 mb-5">
              <Wrench size={18} className="text-[#0A84FF]/70" />
              <h3 className="text-sm font-medium text-white">3D Adapter</h3>
            </div>

            <div className="space-y-3 mb-5">
              {(["threejs", "babylon", "r3f"] as const).map(a => (
                <label key={a} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${adapter === a ? "border-[#0A84FF]/30 bg-[#0A84FF]/5" : "border-white/5 hover:border-white/10"}`}>
                  <input type="radio" name="adapter" checked={adapter === a} onChange={() => setAdapter(a)} className="accent-[#0A84FF]" />
                  <div>
                    <div className="text-sm text-white capitalize">{a === "r3f" ? "React Three Fiber" : a === "babylon" ? "Babylon.js" : "Three.js"}</div>
                    <div className="text-[11px] text-white/25">
                      {a === "r3f" ? "Declarative React 3D" : a === "babylon" ? "Full-featured engine" : "Most popular WebGL lib"}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            <button className="flex items-center gap-2 px-4 py-2 bg-[#0A84FF] text-white rounded-lg text-sm font-medium hover:bg-[#0A84FF]/90 transition-colors">
              <Server size={14} /> Apply Adapter
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-xl bg-[#1A1A1A] border border-white/5 p-6">
          <h3 className="text-sm font-medium text-white mb-4">3D Preview</h3>
          <div className="aspect-video rounded-xl bg-[#0D0D0D] border border-white/5 flex flex-col items-center justify-center">
            <Box size={48} className="text-white/10 mb-3" />
            <p className="text-sm text-white/25">3D viewport will render here</p>
            <p className="text-xs text-white/15 mt-1">Start the dev server to enable</p>
          </div>
        </div>
      </div>
    </div>
  );
}
