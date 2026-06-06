import React, { useState, useEffect } from 'react';
import { AlertTriangle, Shield, ShieldOff, Video, Users, PlaneTakeoff, Plane, ShieldAlert, CheckCircle, Clock, Wifi, WifiOff } from 'lucide-react';
import { io } from 'socket.io-client';

// Mock Data for demonstration before WebSocket connects
const INITIAL_ALERTS = [
  { id: 1, time: '11:52', type: 'restricted', message: 'Passenger 29B moved towards cockpit area.', resolved: false },
  { id: 2, time: '11:45', type: 'suspicious', message: 'Passenger 37A moved to First Class.', resolved: true },
  { id: 3, time: '11:31', type: 'wellbeing', message: 'Lavatory A elapsed time over 20 minutes.', resolved: false },
];

export default function App() {
  const [flightMode, setFlightMode] = useState('cruise');
  const [anonymize, setAnonymize] = useState(true);
  const [alerts, setAlerts] = useState(INITIAL_ALERTS);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  
  // Real-time System State
  const [isConnected, setIsConnected] = useState(false);

  // Time & WebSocket setup
  useEffect(() => {
    // 1. Clock timer
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 60000);

    // 2. Initialize Socket.IO connection to the Backend Gateway
    // Note: In a real deployment, this URL would be an environment variable.
    const socket = io('http://localhost:5000', {
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socket.on('connect', () => {
      console.log('Connected to Amber Backend');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.warn('Disconnected from Amber Backend');
      setIsConnected(false);
    });

    // 3. Listen for alerts pushed from the Microservice -> Backend -> Here
    socket.on('new_alert', (newAlert) => {
      setAlerts(prevAlerts => [newAlert, ...prevAlerts]);
    });

    return () => {
      clearInterval(timer);
      socket.disconnect();
    };
  }, []);

  const resolveAlert = (id) => {
    setAlerts(alerts.map(a => a.id === id ? { ...a, resolved: true } : a));
    // In a full implementation, you would emit an event back to the server here:
    // socket.emit('resolve_alert', { id });
  };

  const unreadAlertsCount = alerts.filter(a => !a.resolved).length;

  return (
    <div className="h-screen bg-slate-900 text-slate-100 font-sans flex flex-col overflow-hidden">
      {/* HEADER */}
      <header className="bg-slate-800 border-b border-slate-700 p-3 flex items-center justify-between shadow-md shrink-0">
        <div className="flex items-center space-x-4">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Plane className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight leading-tight">Airbus Amber</h1>
            <p className="text-xs text-slate-400">Cabin Intelligence System</p>
          </div>
        </div>

        {/* Flight Mode Selector */}
        <div className="flex bg-slate-900 rounded-xl p-1 border border-slate-700">
          <button 
            onClick={() => setFlightMode('boarding')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 ${flightMode === 'boarding' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            <Users className="w-4 h-4" />
            <span>Boarding</span>
          </button>
          <button 
            onClick={() => setFlightMode('taxi')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 ${flightMode === 'taxi' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            <PlaneTakeoff className="w-4 h-4" />
            <span>Taxi</span>
          </button>
          <button 
            onClick={() => setFlightMode('cruise')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 ${flightMode === 'cruise' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            <Plane className="w-4 h-4" />
            <span>Cruise</span>
          </button>
        </div>

        <div className="flex items-center space-x-6 pr-2">
          {/* SYSTEM STATUS UX INDICATOR */}
          <div className={`flex items-center px-3 py-1.5 rounded-full border ${isConnected ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
            {isConnected ? <Wifi className="w-4 h-4 mr-2" /> : <WifiOff className="w-4 h-4 mr-2" />}
            <span className="text-xs font-bold tracking-wide uppercase">
              {isConnected ? 'System Live' : 'Offline'}
            </span>
          </div>

          <div className="text-right">
            <div className="text-xl font-light">{currentTime}</div>
            <div className="text-[10px] text-slate-400 uppercase tracking-widest">UTC +8</div>
          </div>
        </div>
      </header>

      {/* MAIN TABLET LAYOUT */}
      <main className="flex-1 p-3 flex gap-3 min-h-0 overflow-hidden">
        
        {/* LEFT COLUMN: Top-view Cabin + Camera Feeds */}
        <div className="flex-[3] flex flex-col gap-3 min-h-0">
          
          {/* TOP-VIEW CABIN (Upper-Left Area) */}
          <div className="flex-1 bg-slate-800 rounded-xl border border-slate-700 p-3 flex flex-col min-h-0">
            <div className="flex justify-between items-center mb-3 shrink-0">
              <h2 className="font-semibold flex items-center text-sm">
                <Plane className="w-4 h-4 mr-2 text-indigo-400" /> Cabin Overview (Top View)
              </h2>
              <div className="flex space-x-4 text-xs">
                <div className="flex items-center"><div className="w-2.5 h-2.5 bg-emerald-400 rounded-full mr-1.5"></div> Passenger</div>
                <div className="flex items-center"><div className="w-2.5 h-2.5 bg-red-500 rounded-full mr-1.5"></div> Intrusion</div>
                <div className="flex items-center"><div className="w-2.5 h-2.5 bg-yellow-500 rounded mr-1.5"></div> Alert</div>
              </div>
            </div>
            
            <div className="flex-1 bg-slate-900 rounded-lg p-4 relative flex flex-col items-center justify-center overflow-hidden border border-slate-800">
              {/* TOP-VIEW Abstract Cabin Layout */}
              <div className="w-full h-full bg-slate-800 rounded-lg border-2 border-slate-700 relative overflow-hidden">
                
                {/* Cockpit / Restricted Zone (Front of Cabin) */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-12 bg-red-500/20 border-2 border-red-500/50 rounded-b-2xl flex items-center justify-center z-10">
                  <span className="text-red-400/70 text-[10px] font-bold tracking-widest uppercase">Cockpit</span>
                  <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
                </div>

                {/* Cabin Body with Seats */}
                <div className="absolute top-14 left-2 right-2 bottom-2 flex">
                  
                  {/* Left Section - Business Class */}
                  <div className="w-1/4 flex flex-col">
                    <div className="text-[8px] text-slate-500 font-bold text-center mb-1 tracking-widest">BUSINESS</div>
                    <div className="flex-1 grid grid-cols-2 gap-1">
                      {/* Business seats - left side */}
                      <div className="bg-blue-500/20 border border-blue-500/30 rounded flex items-center justify-center text-[8px] text-blue-400/50">1A</div>
                      <div className="bg-blue-500/20 border border-blue-500/30 rounded flex items-center justify-center text-[8px] text-blue-400/50">1B</div>
                      <div className="bg-emerald-500/20 border border-emerald-500/30 rounded flex items-center justify-center text-[8px] text-emerald-400 relative">
                        <div className="absolute inset-0 bg-emerald-400/10 rounded"></div>
                        <span>2A</span>
                        <div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
                      </div>
                      <div className="bg-emerald-500/20 border border-emerald-500/30 rounded flex items-center justify-center text-[8px] text-emerald-400">2B</div>
                    </div>
                  </div>

                  {/* Center-Left Aisle */}
                  <div className="w-4 bg-slate-700/30"></div>

                  {/* Center Section - Economy */}
                  <div className="flex-1 flex flex-col">
                    <div className="text-[8px] text-slate-500 font-bold text-center mb-1 tracking-widest">ECONOMY</div>
                    <div className="flex-1 grid grid-cols-6 gap-1">
                      {/* Row 1 */}
                      <div className="bg-emerald-500/20 border border-emerald-500/30 rounded flex items-center justify-center text-[8px] text-emerald-400 relative">
                        <div className="absolute inset-0 bg-emerald-400/10 rounded"></div>
                        <span>3A</span>
                        <div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
                      </div>
                      <div className="bg-emerald-500/20 border border-emerald-500/30 rounded flex items-center justify-center text-[8px] text-emerald-400">3B</div>
                      <div className="bg-slate-700/50 border border-slate-600/50 rounded flex items-center justify-center text-[8px] text-slate-500">3C</div>
                      <div className="bg-slate-700/50 border border-slate-600/50 rounded flex items-center justify-center text-[8px] text-slate-500">3D</div>
                      <div className="bg-emerald-500/20 border border-emerald-500/30 rounded flex items-center justify-center text-[8px] text-emerald-400">3E</div>
                      <div className="bg-emerald-500/20 border border-emerald-500/30 rounded flex items-center justify-center text-[8px] text-emerald-400">3F</div>
                      {/* Row 2 */}
                      <div className="bg-emerald-500/20 border border-emerald-500/30 rounded flex items-center justify-center text-[8px] text-emerald-400">4A</div>
                      <div className="bg-emerald-500/20 border border-emerald-500/30 rounded flex items-center justify-center text-[8px] text-emerald-400 relative">
                        <div className="absolute inset-0 bg-red-400/10 rounded"></div>
                        <span className="text-red-400">4B</span>
                        <div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse"></div>
                      </div>
                      <div className="bg-slate-700/50 border border-slate-600/50 rounded flex items-center justify-center text-[8px] text-slate-500">4C</div>
                      <div className="bg-slate-700/50 border border-slate-600/50 rounded flex items-center justify-center text-[8px] text-slate-500">4D</div>
                      <div className="bg-emerald-500/20 border border-emerald-500/30 rounded flex items-center justify-center text-[8px] text-emerald-400">4E</div>
                      <div className="bg-emerald-500/20 border border-emerald-500/30 rounded flex items-center justify-center text-[8px] text-emerald-400">4F</div>
                      {/* Row 3 */}
                      <div className="bg-emerald-500/20 border border-emerald-500/30 rounded flex items-center justify-center text-[8px] text-emerald-400">5A</div>
                      <div className="bg-emerald-500/20 border border-emerald-500/30 rounded flex items-center justify-center text-[8px] text-emerald-400">5B</div>
                      <div className="bg-slate-700/50 border border-slate-600/50 rounded flex items-center justify-center text-[8px] text-slate-500">5C</div>
                      <div className="bg-slate-700/50 border border-slate-600/50 rounded flex items-center justify-center text-[8px] text-slate-500">5D</div>
                      <div className="bg-emerald-500/20 border border-emerald-500/30 rounded flex items-center justify-center text-[8px] text-emerald-400">5E</div>
                      <div className="bg-emerald-500/20 border border-emerald-500/30 rounded flex items-center justify-center text-[8px] text-emerald-400">5F</div>
                      {/* Row 4 */}
                      <div className="bg-emerald-500/20 border border-emerald-500/30 rounded flex items-center justify-center text-[8px] text-emerald-400">6A</div>
                      <div className="bg-emerald-500/20 border border-emerald-500/30 rounded flex items-center justify-center text-[8px] text-emerald-400">6B</div>
                      <div className="bg-yellow-500/20 border border-yellow-500/30 rounded flex items-center justify-center text-[8px] text-yellow-400 relative">
                        <div className="absolute inset-0 bg-yellow-400/10 rounded"></div>
                        <span>6C</span>
                        <div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse"></div>
                      </div>
                      <div className="bg-yellow-500/20 border border-yellow-500/30 rounded flex items-center justify-center text-[8px] text-yellow-400">6D</div>
                      <div className="bg-emerald-500/20 border border-emerald-500/30 rounded flex items-center justify-center text-[8px] text-emerald-400">6E</div>
                      <div className="bg-emerald-500/20 border border-emerald-500/30 rounded flex items-center justify-center text-[8px] text-emerald-400">6F</div>
                    </div>
                  </div>

                  {/* Center-Right Aisle */}
                  <div className="w-4 bg-slate-700/30"></div>

                  {/* Right Section - Economy continued */}
                  <div className="w-1/4 flex flex-col">
                    <div className="text-[8px] text-slate-500 font-bold text-center mb-1 tracking-widest">ECONOMY</div>
                    <div className="flex-1 grid grid-cols-2 gap-1">
                      <div className="bg-emerald-500/20 border border-emerald-500/30 rounded flex items-center justify-center text-[8px] text-emerald-400">7A</div>
                      <div className="bg-emerald-500/20 border border-emerald-500/30 rounded flex items-center justify-center text-[8px] text-emerald-400">7B</div>
                      <div className="bg-emerald-500/20 border border-emerald-500/30 rounded flex items-center justify-center text-[8px] text-emerald-400">8A</div>
                      <div className="bg-emerald-500/20 border border-emerald-500/30 rounded flex items-center justify-center text-[8px] text-emerald-400">8B</div>
                      <div className="bg-emerald-500/20 border border-emerald-500/30 rounded flex items-center justify-center text-[8px] text-emerald-400">9A</div>
                      <div className="bg-emerald-500/20 border border-emerald-500/30 rounded flex items-center justify-center text-[8px] text-emerald-400">9B</div>
                    </div>
                  </div>

                </div>

                {/* Lavatories (Right Edge) */}
                <div className="absolute right-0 top-14 w-8 flex flex-col gap-1 p-1">
                  <div className="h-10 bg-yellow-500/20 border border-yellow-500/30 rounded flex items-center justify-center relative">
                    <div className="absolute inset-0 border border-yellow-500 rounded animate-pulse"></div>
                    <span className="text-[8px] text-yellow-400 font-bold -rotate-90">LAV</span>
                  </div>
                  <div className="h-10 bg-slate-700/50 border border-slate-600/50 rounded flex items-center justify-center">
                    <span className="text-[8px] text-slate-500 font-bold -rotate-90">LAV</span>
                  </div>
                </div>

                {/* Galley (Left Edge) */}
                <div className="absolute left-0 top-14 w-6 flex flex-col gap-1 p-1">
                  <div className="flex-1 bg-purple-500/20 border border-purple-500/30 rounded flex items-center justify-center">
                    <span className="text-[8px] text-purple-400 font-bold" style={{writingMode: 'vertical-rl', textOrientation: 'mixed'}}>GALLEY</span>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* CAMERA FEEDS (Bottom - 4 cameras) */}
          <div className="h-48 lg:h-56 bg-slate-800 rounded-xl border border-slate-700 p-3 flex flex-col shrink-0">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h2 className="font-semibold flex items-center text-sm">
                <Video className="w-4 h-4 mr-2 text-blue-400" /> Live Camera Feeds
              </h2>
              <button 
                onClick={() => setAnonymize(!anonymize)}
                className={`flex items-center px-3 py-1 rounded text-xs font-medium transition-colors ${anonymize ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}
              >
                {anonymize ? <Shield className="w-3.5 h-3.5 mr-1.5" /> : <ShieldOff className="w-3.5 h-3.5 mr-1.5" />}
                {anonymize ? 'Anonymization ON' : 'Anonymization OFF'}
              </button>
            </div>
            
            <div className="grid grid-cols-4 gap-3 flex-1 min-h-0">
              {/* Camera 1 - Forward Aisle */}
              <div className="bg-black rounded-lg border border-slate-700 relative overflow-hidden group">
                <img src="https://images.unsplash.com/photo-1540339832862-474589b0a11b?auto=format&fit=crop&w=600&q=80" alt="Cabin FWD" className="w-full h-full object-cover opacity-60" />
                <div className="absolute top-2 left-2 bg-black/60 px-1.5 py-0.5 rounded text-[10px] font-mono shadow">CAM 1: FWD</div>
                <div className="absolute bottom-2 right-2 bg-emerald-500/80 px-1.5 py-0.5 rounded text-[10px] font-bold text-black">LIVE</div>
                <div className="absolute top-1/4 left-1/3 w-16 h-32 border border-emerald-400 bg-emerald-400/10">
                  <span className="bg-emerald-400 text-slate-900 text-[9px] font-bold px-1 absolute -top-4 left-0">ID:42 {anonymize ? '' : 'Doe, J'}</span>
                </div>
              </div>
              
              {/* Camera 2 - Mid Aisle */}
              <div className="bg-black rounded-lg border border-slate-700 relative overflow-hidden">
                <img src="https://images.unsplash.com/photo-1569154941061-e231b4725ef1?auto=format&fit=crop&w=600&q=80" alt="Mid Cabin" className="w-full h-full object-cover opacity-60" />
                <div className="absolute top-2 left-2 bg-black/60 px-1.5 py-0.5 rounded text-[10px] font-mono shadow">CAM 2: MID</div>
                <div className="absolute bottom-2 right-2 bg-emerald-500/80 px-1.5 py-0.5 rounded text-[10px] font-bold text-black">LIVE</div>
              </div>
              
              {/* Camera 3 - Galley */}
              <div className="bg-black rounded-lg border border-slate-700 relative overflow-hidden">
                <img src="https://images.unsplash.com/photo-1569154941061-e231b4725ef1?auto=format&fit=crop&w=600&q=80" alt="Galley" className="w-full h-full object-cover opacity-60" />
                <div className="absolute top-2 left-2 bg-black/60 px-1.5 py-0.5 rounded text-[10px] font-mono shadow">CAM 3: GALLEY</div>
                <div className="absolute bottom-2 right-2 bg-emerald-500/80 px-1.5 py-0.5 rounded text-[10px] font-bold text-black">LIVE</div>
                <div className="absolute top-1/3 left-1/2 w-16 h-28 border-[1.5px] border-red-500 bg-red-500/20">
                  <span className="bg-red-500 text-white text-[9px] font-bold px-1 absolute -top-4 left-0 flex items-center"><ShieldAlert className="w-2.5 h-2.5 mr-0.5"/> ALERT</span>
                </div>
              </div>
              
              {/* Camera 4 - Aft Aisle */}
              <div className="bg-black rounded-lg border border-slate-700 relative overflow-hidden">
                <img src="https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=600&q=80" alt="Cabin AFT" className="w-full h-full object-cover opacity-50 grayscale" />
                <div className="absolute top-2 left-2 bg-black/60 px-1.5 py-0.5 rounded text-[10px] font-mono shadow">CAM 4: AFT</div>
                <div className="absolute bottom-2 right-2 bg-yellow-500/80 px-1.5 py-0.5 rounded text-[10px] font-bold text-black">WARN</div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Events/Alerts Panel */}
        <div className="flex-1 max-w-sm flex flex-col bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="p-3 border-b border-slate-700 flex justify-between items-center bg-slate-800/80 shrink-0">
            <h2 className="font-semibold flex items-center text-sm">
              <AlertTriangle className="w-4 h-4 mr-2 text-orange-400" /> Identified Events
            </h2>
            {unreadAlertsCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {unreadAlertsCount} New
              </span>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {alerts.map((alert) => {
              let styles = "";
              let Icon = null;
              
              if (alert.type === 'restricted') {
                styles = alert.resolved ? "bg-slate-900 border-slate-700 opacity-60" : "bg-red-900/20 border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.1)]";
                Icon = ShieldAlert;
              } else if (alert.type === 'suspicious') {
                styles = alert.resolved ? "bg-slate-900 border-slate-700 opacity-60" : "bg-orange-900/20 border-orange-500/50 shadow-[0_0_10px_rgba(249,115,22,0.1)]";
                Icon = AlertTriangle;
              } else {
                styles = alert.resolved ? "bg-slate-900 border-slate-700 opacity-60" : "bg-yellow-900/20 border-yellow-500/50";
                Icon = Clock;
              }

              return (
                <div key={alert.id} className={`p-3 rounded-lg border transition-all ${styles}`}>
                  <div className="flex justify-between items-start mb-1.5">
                    <div className="flex items-center space-x-1.5">
                      <Icon className={`w-4 h-4 ${alert.resolved ? 'text-slate-500' : (alert.type === 'restricted' ? 'text-red-400' : alert.type === 'suspicious' ? 'text-orange-400' : 'text-yellow-400')}`} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${alert.resolved ? 'text-slate-500' : (alert.type === 'restricted' ? 'text-red-400' : alert.type === 'suspicious' ? 'text-orange-400' : 'text-yellow-400')}`}>
                        {alert.type}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded">{alert.time}</span>
                  </div>
                  <p className={`text-xs mb-3 leading-snug ${alert.resolved ? 'text-slate-400' : 'text-slate-200'}`}>
                    {alert.message}
                  </p>
                  
                  {!alert.resolved && (
                    <div className="flex space-x-2 mt-auto">
                      <button 
                        onClick={() => resolveAlert(alert.id)}
                        className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 py-1.5 rounded text-xs font-medium transition-colors flex items-center justify-center active:scale-95"
                      >
                        <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Acknowledge
                      </button>
                    </div>
                  )}
                  {alert.resolved && (
                    <div className="text-[10px] text-slate-500 flex items-center mt-auto">
                      <CheckCircle className="w-3 h-3 mr-1" /> Handled by Crew
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </main>
    </div>
  );
}