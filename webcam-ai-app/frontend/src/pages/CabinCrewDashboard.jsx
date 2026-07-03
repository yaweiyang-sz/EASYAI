import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlertTriangle, Shield, ShieldOff, Video, Users, PlaneTakeoff, Plane, ShieldAlert, CheckCircle, Clock, Wifi, Maximize2, ShipWheel, PackageCheck, Radar, Briefcase, Edit3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cameraApi } from '../services/api';
import { subscribe } from '../services/streamManager';
import { base64JpegToObjectUrl, replaceImageObjectUrl, revokeImageObjectUrl } from '../services/frameUtils';

const INITIAL_ALERTS = [
  { id: 1, time: '11:52', type: 'restricted', message: 'Passenger 29B moved towards cockpit area.', resolved: false },
  { id: 2, time: '11:45', type: 'suspicious', message: 'Passenger 37A moved to First Class.', resolved: true },
  { id: 3, time: '11:31', type: 'wellbeing', message: 'Lavatory A elapsed time over 20 minutes.', resolved: false },
];

const generatePassengerData = () => {
  const data = {};
  for (let row = 1; row <= 4; row++) {
    data[`${row}A`] = Math.random() > 0.3;
    data[`${row}D`] = Math.random() > 0.3;
    data[`${row}G`] = Math.random() > 0.3;
    data[`${row}K`] = Math.random() > 0.3;
  }
  for (let row = 1; row <= 8; row++) {
    data[`e${row}A`] = Math.random() > 0.2;
    data[`e${row}B`] = Math.random() > 0.2;
    data[`e${row}C`] = Math.random() > 0.2;
    data[`e${row}D`] = Math.random() > 0.2;
    data[`e${row}E`] = Math.random() > 0.2;
    data[`e${row}F`] = Math.random() > 0.2;
    data[`e${row}G`] = Math.random() > 0.2;
    data[`e${row}H`] = Math.random() > 0.2;
  }
  return data;
};

const PASSENGER_DATA = generatePassengerData();

const MOVING_PASSENGERS = [
  { position: 'business', row: 2, side: 'left' },
  { position: 'business', row: 3, side: 'right' },
  { position: 'economy', row: 4, side: 'middle' },
  { position: 'economy', row: 6, side: 'left' },
];

const USE_CASES = [
  { id: 'cabin-monitoring', label: 'Cabin Monitoring', Icon: ShipWheel, accent: 'from-blue-500 to-cyan-400' },
  { id: 'cargo-latch', label: 'Cargo Latch', Icon: PackageCheck, accent: 'from-amber-500 to-orange-400' },
  { id: 'sentry-mode', label: 'Sentry Mode', Icon: Radar, accent: 'from-red-500 to-pink-500' },
  { id: 'baggage-bin', label: 'Baggage Bin', Icon: Briefcase, accent: 'from-emerald-500 to-lime-400' },
];

const USE_CASE_COPY = {
  'cabin-monitoring': {
    title: 'Cabin Monitoring Overview (A350 Top View)',
    subtitle: 'Passenger movement, occupancy, and crew alerts',
  },
  'cargo-latch': {
    title: 'Cargo Latch Monitoring',
    subtitle: 'Latch integrity and cargo-area access states',
  },
  'sentry-mode': {
    title: 'Sentry Mode Overview',
    subtitle: 'Perimeter watch, restricted zones, and suspicious movement',
  },
  'baggage-bin': {
    title: 'Cabin Baggage Bin Status',
    subtitle: 'Overhead bin closure, loading state, and blockage alerts',
  },
};


export default function CabinCrewDashboard() {
  const navigate = useNavigate();
  const [flightMode, setFlightMode] = useState('cruise');
  const [anonymize, setAnonymize] = useState(true);
  const [alerts, setAlerts] = useState(INITIAL_ALERTS);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const [passengers, setPassengers] = useState(PASSENGER_DATA);
  const [cameras, setCameras] = useState([]);
  const [loadingCameras, setLoadingCameras] = useState(false);
  const [detectionAlerts, setDetectionAlerts] = useState({});
  const [activeUseCase, setActiveUseCase] = useState('cabin-monitoring');

  const unsubscribeRefs = useRef({});
  const imgRefs = useRef({});
  const camerasRef = useRef([]);
  const mountedRef = useRef(true);
  const lastDetectionUpdateRef = useRef(0);

  useEffect(() => {
    camerasRef.current = cameras;
  }, [cameras]);

  const renderCameraFrame = useCallback((cameraId, base64Data) => {
    const img = imgRefs.current[cameraId];
    if (!img || !mountedRef.current) return;

    const placeholder = document.getElementById(`cam-placeholder-${cameraId}`);
    if (placeholder) {
      placeholder.style.opacity = '0';
      setTimeout(() => {
        if (placeholder.parentNode) placeholder.style.display = 'none';
      }, 300);
    }

    replaceImageObjectUrl(img, base64JpegToObjectUrl(base64Data), 250);
  }, []);

  const connectCameraWebSocket = useCallback((cameraId) => {
    // Already subscribed
    if (unsubscribeRefs.current[cameraId]) return;

    const unsub = subscribe(cameraId, {
      onFrame: (base64Data, msgData) => {
        if (!mountedRef.current) return;
        renderCameraFrame(cameraId, base64Data);
        if (msgData.detections?.length > 0 && Date.now() - lastDetectionUpdateRef.current > 250) {
          lastDetectionUpdateRef.current = Date.now();
          const camera = camerasRef.current.find(c => c.id === cameraId);
          const cameraName = camera?.name || 'Unknown Camera';
          setDetectionAlerts(prev => {
            const updated = { ...prev };
            msgData.detections.forEach(det => {
              const key = `${cameraId}-${det.label}`;
              const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              if (updated[key]) {
                updated[key] = { ...updated[key], time: nowTime, confidence: det.confidence, count: updated[key].count + 1 };
              } else {
                updated[key] = { id: key, cameraId, cameraName, label: det.label, confidence: det.confidence, time: nowTime, count: 1, resolved: false };
              }
            });
            return updated;
          });
        }
      },
    });
    unsubscribeRefs.current[cameraId] = unsub;
  }, [renderCameraFrame]);

  const disconnectAllWebSockets = useCallback(() => {
    Object.entries(unsubscribeRefs.current).forEach(([, unsub]) => unsub?.());
    unsubscribeRefs.current = {};
    Object.values(imgRefs.current).forEach(revokeImageObjectUrl);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 60000);
    const passengerTimer = setInterval(() => {
      setPassengers(prev => {
        const newPassengers = { ...prev };
        const seats = Object.keys(newPassengers);
        const randomSeat = seats[Math.floor(Math.random() * seats.length)];
        newPassengers[randomSeat] = !newPassengers[randomSeat];
        return newPassengers;
      });
    }, 5000);
    return () => { mountedRef.current = false; clearInterval(timer); clearInterval(passengerTimer); };
  }, []);

  useEffect(() => {
    const loadCameras = async () => {
      try {
        setLoadingCameras(true);
        const data = await cameraApi.list();
        if (!mountedRef.current) return;
        setCameras(data);
        data.forEach(camera => { if (camera.enabled) connectCameraWebSocket(camera.id); });
      } catch (err) {} finally {
        if (mountedRef.current) setLoadingCameras(false);
      }
    };
    loadCameras();
    return () => { disconnectAllWebSockets(); };
  }, []);

  const resolveDetectionAlert = (key) => setDetectionAlerts(prev => { const u = { ...prev }; if (u[key]) u[key].resolved = true; return u; });
  const resolveAlert = (id) => setAlerts(alerts.map(a => a.id === id ? { ...a, resolved: true } : a));
  const unreadAlertsCount = alerts.filter(a => !a.resolved).length;
  const activeUseCaseCopy = USE_CASE_COPY[activeUseCase];
  const isSeatOccupied = (seatId) => passengers[seatId] || false;

  return (
    <div className="h-screen bg-slate-900 text-slate-100 font-sans flex flex-col overflow-hidden">
      <header className="bg-slate-800 border-b border-slate-700 p-3 flex items-center justify-between shadow-md shrink-0">
        <div className="flex items-center space-x-4">
          <div className="bg-blue-600 p-2 rounded-lg"><Plane className="w-5 h-5 text-white" /></div>
          <div><h1 className="text-lg font-bold tracking-tight leading-tight">Airbus Amber</h1><p className="text-xs text-slate-400">Cabin Intelligence System</p></div>
        </div>
        <div className="flex bg-slate-900 rounded-xl p-1 border border-slate-700">
          {['boarding', 'taxi', 'cruise'].map(mode => {
            const icons = { boarding: Users, taxi: PlaneTakeoff, cruise: Plane };
            const Icon = icons[mode];
            return (
              <button key={mode} onClick={() => setFlightMode(mode)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 ${flightMode === mode ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
                <Icon className="w-4 h-4" /><span>{mode.charAt(0).toUpperCase() + mode.slice(1)}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center space-x-6 pr-2">
          <div className="flex items-center px-3 py-1.5 rounded-full border bg-emerald-500/10 border-emerald-500/30 text-emerald-400"><Wifi className="w-4 h-4 mr-2" /><span className="text-xs font-bold tracking-wide uppercase">System Live</span></div>
          <div className="text-right"><div className="text-xl font-light">{currentTime}</div><div className="text-[10px] text-slate-400 uppercase tracking-widest">UTC +8</div></div>
        </div>
      </header>

      <main className="flex-1 p-2 pb-20 flex flex-col lg:flex-row gap-2 min-h-0 overflow-hidden w-full">
        <div className="flex-1 lg:flex-[5] flex flex-col gap-2 min-h-0">
          <div className="flex-[2] lg:flex-[3] bg-slate-800 rounded-xl border border-slate-700 p-3 flex flex-col min-h-0 overflow-hidden">
            <div className="flex justify-between items-center mb-3 shrink-0">
              <div><h2 className="font-semibold flex items-center text-sm"><Plane className="w-4 h-4 mr-2 text-indigo-400" /> {activeUseCaseCopy.title}</h2><p className="text-[10px] text-slate-400 mt-0.5">{activeUseCaseCopy.subtitle}</p></div>
              <div className="flex space-x-3 text-xs">
                <div className="flex items-center"><div className="w-2.5 h-2.5 bg-emerald-500 rounded mr-1.5"></div> Occupied</div>
                <div className="flex items-center"><div className="w-2.5 h-2.5 bg-transparent border border-slate-500 rounded mr-1.5"></div> Empty</div>
                <div className="flex items-center"><div className="w-2.5 h-2.5 bg-yellow-500 rounded mr-1.5"></div> Alert</div>
                <div className="flex items-center"><div className="w-2.5 h-2.5 bg-blue-400 rounded-full mr-1.5"></div> Moving</div>
              </div>
            </div>
            <div className="flex-1 bg-slate-900 rounded-lg border border-slate-800 overflow-x-auto overflow-y-hidden">
              <div className="h-full min-w-full">
                <div className="flex h-full">
                  <div className="bg-red-500/20 border-r-2 border-red-500/50 flex flex-col items-center justify-center flex-[0.6] min-w-[40px]">
                    <div className="w-3 h-3 lg:w-5 lg:h-5 bg-red-500 rounded-full animate-pulse"></div>
                    <div className="mt-1 text-[8px] lg:text-xs font-bold text-red-400 writing-mode-vertical">COCKPIT</div>
                  </div>
                  <div className="bg-purple-500/20 border-x-2 border-purple-500/30 flex flex-col items-center justify-center flex-[0.5] min-w-[32px]">
                    <div className="text-[7px] lg:text-[9px] text-purple-400 font-bold tracking-widest writing-mode-vertical">GALLEY</div>
                  </div>
                  <div className="bg-slate-800/50 flex flex-col flex-[2]">
                    <div className="bg-slate-800 border-b border-slate-700 px-2 py-1"><span className="text-[10px] text-slate-400 font-bold tracking-widest">BUSINESS CLASS (1-2-1)</span></div>
                    <div className="flex-1 flex flex-row gap-0.5 p-1">
                      {[1,2,3,4].map(row => (
                        <div key={row} className="flex flex-col gap-0.5 flex-1">
                          <div className={`flex-[0.5] rounded border flex items-center justify-center text-[5px] font-medium transition-all ${isSeatOccupied(`${row}A`) ? 'bg-emerald-500/70 border-emerald-400 text-white shadow shadow-emerald-500/30' : 'bg-transparent border-slate-600 text-slate-400'}`}>{row}A</div>
                          <div className="flex-[0.6] bg-slate-700/30 rounded-lg relative min-h-[16px]">
                            {MOVING_PASSENGERS.find(p => p.position === 'business' && p.row === row && p.side === 'left') && (
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce shadow shadow-blue-400/50"></div>
                            )}
                          </div>
                          <div className={`flex-[0.5] rounded border flex items-center justify-center text-[5px] font-medium transition-all ${isSeatOccupied(`${row}D`) ? 'bg-emerald-500/70 border-emerald-400 text-white shadow shadow-emerald-500/30' : 'bg-transparent border-slate-600 text-slate-400'}`}>{row}D</div>
                          <div className={`flex-[0.5] rounded border flex items-center justify-center text-[5px] font-medium transition-all ${isSeatOccupied(`${row}G`) ? 'bg-emerald-500/70 border-emerald-400 text-white shadow shadow-emerald-500/30' : 'bg-transparent border-slate-600 text-slate-400'}`}>{row}G</div>
                          <div className="flex-[0.6] bg-slate-700/30 rounded-lg relative min-h-[16px]">
                            {MOVING_PASSENGERS.find(p => p.position === 'business' && p.row === row && p.side === 'right') && (
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce shadow shadow-blue-400/50"></div>
                            )}
                          </div>
                          <div className={`flex-[0.5] rounded border flex items-center justify-center text-[5px] font-medium transition-all ${isSeatOccupied(`${row}K`) ? 'bg-emerald-500/70 border-emerald-400 text-white shadow shadow-emerald-500/30' : 'bg-transparent border-slate-600 text-slate-400'}`}>{row}K</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col flex-[0.5] min-w-[32px]">
                    <div className="flex-1 bg-yellow-500/20 border-x border-yellow-500/30 flex items-center justify-center relative">
                      <div className="absolute inset-0 border border-yellow-500/50 animate-pulse"></div>
                      <span className="text-[7px] lg:text-[9px] text-yellow-400 font-bold writing-mode-vertical">LAV A</span>
                    </div>
                    <div className="flex-1 bg-yellow-500/20 border-x border-yellow-500/30 flex items-center justify-center">
                      <span className="text-[7px] lg:text-[9px] text-yellow-400 font-bold writing-mode-vertical">LAV B</span>
                    </div>
                  </div>
                  <div className="bg-slate-800/30 flex flex-col flex-[2.5]">
                    <div className="bg-slate-800 border-b border-slate-700 px-2 py-1"><span className="text-[10px] text-slate-400 font-bold tracking-widest">ECONOMY CLASS (2-4-2)</span></div>
                    <div className="flex-1 flex flex-row gap-0.5 p-1">
                      {[1,2,3,4,5,6,7,8].map(row => (
                        <div key={row} className="flex flex-col gap-0.5 flex-1">
                          <div className={`flex-[0.4] rounded border flex items-center justify-center text-[5px] font-medium transition-all ${isSeatOccupied(`e${row}A`) ? 'bg-emerald-500/70 border-emerald-400 text-white shadow shadow-emerald-500/30' : 'bg-transparent border-slate-600 text-slate-400'}`}>A</div>
                          <div className={`flex-[0.4] rounded border flex items-center justify-center text-[5px] font-medium transition-all ${isSeatOccupied(`e${row}B`) ? 'bg-emerald-500/70 border-emerald-400 text-white shadow shadow-emerald-500/30' : 'bg-transparent border-slate-600 text-slate-400'}`}>B</div>
                          <div className="flex-[0.5] bg-slate-700/30 rounded-lg relative min-h-[14px]">
                            {MOVING_PASSENGERS.find(p => p.position === 'economy' && p.row === row && p.side === 'left') && (
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce shadow shadow-blue-400/50"></div>
                            )}
                          </div>
                          <div className={`flex-[0.4] rounded border flex items-center justify-center text-[5px] font-medium transition-all ${isSeatOccupied(`e${row}C`) ? 'bg-emerald-500/70 border-emerald-400 text-white shadow shadow-emerald-500/30' : 'bg-transparent border-slate-600 text-slate-400'}`}>C</div>
                          <div className={`flex-[0.4] rounded border flex items-center justify-center text-[5px] font-medium transition-all ${isSeatOccupied(`e${row}D`) ? 'bg-emerald-500/70 border-emerald-400 text-white shadow shadow-emerald-500/30' : 'bg-transparent border-slate-600 text-slate-400'}`}>D</div>
                          <div className={`flex-[0.4] rounded border flex items-center justify-center text-[5px] font-medium transition-all ${isSeatOccupied(`e${row}E`) ? 'bg-emerald-500/70 border-emerald-400 text-white shadow shadow-emerald-500/30' : 'bg-transparent border-slate-600 text-slate-400'}`}>E</div>
                          <div className={`flex-[0.4] rounded border flex items-center justify-center text-[5px] font-medium transition-all ${isSeatOccupied(`e${row}F`) ? 'bg-emerald-500/70 border-emerald-400 text-white shadow shadow-emerald-500/30' : 'bg-transparent border-slate-600 text-slate-400'}`}>F</div>
                          <div className="flex-[0.5] bg-slate-700/30 rounded-lg relative min-h-[14px]">
                            {MOVING_PASSENGERS.find(p => p.position === 'economy' && p.row === row && (p.side === 'right' || p.side === 'middle')) && (
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce shadow shadow-blue-400/50"></div>
                            )}
                          </div>
                          <div className={`flex-[0.4] rounded border flex items-center justify-center text-[5px] font-medium transition-all ${isSeatOccupied(`e${row}G`) ? 'bg-emerald-500/70 border-emerald-400 text-white shadow shadow-emerald-500/30' : 'bg-transparent border-slate-600 text-slate-400'}`}>G</div>
                          <div className={`flex-[0.4] rounded border flex items-center justify-center text-[5px] font-medium transition-all ${isSeatOccupied(`e${row}H`) ? 'bg-emerald-500/70 border-emerald-400 text-white shadow shadow-emerald-500/30' : 'bg-transparent border-slate-600 text-slate-400'}`}>H</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col flex-[0.5] min-w-[32px]">
                    <div className="flex-1 bg-yellow-500/20 border-x border-yellow-500/30 flex items-center justify-center">
                      <span className="text-[7px] lg:text-[9px] text-yellow-400 font-bold writing-mode-vertical">LAV C</span>
                    </div>
                    <div className="flex-1 bg-yellow-500/20 border-x border-yellow-500/30 flex items-center justify-center relative">
                      <div className="absolute inset-0 border border-yellow-500/50 animate-pulse"></div>
                      <span className="text-[7px] lg:text-[9px] text-yellow-400 font-bold writing-mode-vertical">LAV D</span>
                    </div>
                  </div>
                  <div className="bg-purple-500/20 border-x-2 border-purple-500/30 flex flex-col items-center justify-center flex-[0.5] min-w-[32px]">
                    <div className="text-[7px] lg:text-[9px] text-purple-400 font-bold tracking-widest writing-mode-vertical">GALLEY</div>
                  </div>
                  <div className="bg-slate-700/50 border-l-2 border-slate-600/50 flex flex-col items-center justify-center flex-[0.6] min-w-[40px]">
                    <div className="text-[8px] lg:text-[11px] text-slate-400 font-bold tracking-widest writing-mode-vertical">REAR CARGO</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-[0.6] lg:flex-[0.8] bg-slate-800 rounded-xl border border-slate-700 p-3 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <h2 className="font-semibold flex items-center text-sm"><Video className="w-4 h-4 mr-2 text-blue-400" /> Camera Thumbnails</h2>
            <div className="flex items-center space-x-2">
              <button onClick={() => navigate('/cameras')} className="bg-blue-600/80 hover:bg-blue-500 p-1.5 rounded transition-colors" title="Edit cameras"><Edit3 className="w-3 h-3 text-white" /></button>
              <button onClick={() => setAnonymize(!anonymize)} className={`flex items-center px-2 py-1 rounded text-[10px] font-medium transition-colors ${anonymize ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                {anonymize ? <Shield className="w-3 h-3 mr-1" /> : <ShieldOff className="w-3 h-3 mr-1" />}{anonymize ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
          <div className="flex-1 flex gap-3 overflow-x-auto overflow-y-hidden">
            {loadingCameras ? (
              <div className="flex items-center justify-center py-8"><div className="text-slate-400 text-sm">Loading cameras...</div></div>
            ) : cameras.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center"><Video className="w-12 h-12 text-slate-600 mb-3" /><div className="text-slate-400 text-sm mb-2">No cameras added</div><div className="text-slate-500 text-xs">Add cameras in the "Cameras" tab</div></div>
            ) : (
              cameras.map((camera, index) => (
                <div key={camera.id} className="bg-black rounded-lg border border-slate-700 overflow-hidden cursor-pointer hover:border-blue-500 transition-colors flex-shrink-0 relative"
                  style={{ aspectRatio: '16/9', width: 'clamp(120px, 22vw, 180px)' }}
                  onClick={() => navigate(`/camera/${camera.id}`)}>
                  {camera.enabled ? (
                    <>
                      <img ref={el => { imgRefs.current[camera.id] = el; }} alt={camera.name} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-800 transition-opacity duration-300" id={`cam-placeholder-${camera.id}`}><div className="text-slate-500 text-xs">Connecting...</div></div>
                    </>
                  ) : (<div className="w-full h-full flex items-center justify-center bg-slate-800"><div className="text-slate-500 text-xs">Camera Offline</div></div>)}
                  <div className="absolute top-1 left-1 bg-black/60 px-1 py-0.5 rounded text-[8px] font-mono shadow">CAM {index + 1}: {camera.name}</div>
                  <div className="absolute top-1 right-1 bg-black/60 px-1 py-0.5 rounded text-[7px] text-slate-300">{camera.type.toUpperCase()}</div>
                  <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[8px] font-bold bg-emerald-500/80 text-black">{camera.enabled ? 'LIVE' : 'OFFLINE'}</div>
                  <button className="absolute bottom-1 left-1 bg-blue-600/80 hover:bg-blue-500 p-1 rounded transition-colors"
                    onClick={(e) => { e.stopPropagation(); navigate(`/camera/${camera.id}`); }} title="Open camera view"><Maximize2 className="w-2.5 h-2.5 text-white" /></button>
                </div>
              ))
            )}
          </div>
        </div>
        </div>

        <div className="flex-[1] lg:flex-[0.83] bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="p-3 border-b border-slate-700 flex justify-between items-center bg-slate-800/80 shrink-0">
            <h2 className="font-semibold flex items-center text-sm"><AlertTriangle className="w-4 h-4 mr-2 text-orange-400" /> Identified Events</h2>
            {unreadAlertsCount > 0 && <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{unreadAlertsCount} New</span>}
          </div>
          <div className="p-3 space-y-2 overflow-y-auto" style={{height: 'calc(100% - 52px)'}}>
            {alerts.map((alert) => {
              let styles = "", Icon = null;
              if (alert.type === 'restricted') { styles = alert.resolved ? "bg-slate-900 border-slate-700 opacity-60" : "bg-red-900/20 border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.1)]"; Icon = ShieldAlert; }
              else if (alert.type === 'suspicious') { styles = alert.resolved ? "bg-slate-900 border-slate-700 opacity-60" : "bg-orange-900/20 border-orange-500/50 shadow-[0_0_10px_rgba(249,115,22,0.1)]"; Icon = AlertTriangle; }
              else { styles = alert.resolved ? "bg-slate-900 border-slate-700 opacity-60" : "bg-yellow-900/20 border-yellow-500/50"; Icon = Clock; }
              return (
                <div key={alert.id} className={`p-3 rounded-lg border transition-all ${styles}`}>
                  <div className="flex justify-between items-start mb-1.5">
                    <div className="flex items-center space-x-1.5"><Icon className={`w-4 h-4 ${alert.resolved ? 'text-slate-500' : (alert.type === 'restricted' ? 'text-red-400' : alert.type === 'suspicious' ? 'text-orange-400' : 'text-yellow-400')}`} /><span className={`text-xs font-bold uppercase tracking-wider ${alert.resolved ? 'text-slate-500' : (alert.type === 'restricted' ? 'text-red-400' : alert.type === 'suspicious' ? 'text-orange-400' : 'text-yellow-400')}`}>{alert.type}</span></div>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded">{alert.time}</span>
                  </div>
                  <p className={`text-xs mb-3 leading-snug ${alert.resolved ? 'text-slate-400' : 'text-slate-200'}`}>{alert.message}</p>
                  {!alert.resolved && (
                    <div className="flex space-x-2 mt-auto"><button onClick={() => resolveAlert(alert.id)} className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 py-1.5 rounded text-xs font-medium transition-colors flex items-center justify-center active:scale-95"><CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Acknowledge</button></div>
                  )}
                  {alert.resolved && <div className="text-[10px] text-slate-500 flex items-center mt-auto"><CheckCircle className="w-3 h-3 mr-1" /> Handled by Crew</div>}
                </div>
              );
            })}
            {Object.values(detectionAlerts).length > 0 && (
              <div className="border-t border-slate-700 pt-3 mt-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center"><Users className="w-3.5 h-3.5 mr-1.5 text-blue-400" /> AI Detection Events</h3>
                {Object.values(detectionAlerts).map((det) => (
                  <div key={det.id} className={`p-3 rounded-lg border transition-all ${det.resolved ? "bg-slate-900 border-slate-700 opacity-60" : "bg-blue-900/20 border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.1)]"}`}>
                    <div className="flex justify-between items-start mb-1.5">
                      <div className="flex items-center space-x-1.5"><Users className={`w-4 h-4 ${det.resolved ? 'text-slate-500' : 'text-blue-400'}`} /><span className={`text-xs font-bold uppercase tracking-wider ${det.resolved ? 'text-slate-500' : 'text-blue-400'}`}>Detection</span></div>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded">{det.time}</span>
                    </div>
                    <p className={`text-xs mb-2 leading-snug ${det.resolved ? 'text-slate-400' : 'text-slate-200'}`}><span className="font-semibold">{det.label}</span> detected by {det.cameraName}</p>
                    <div className="flex items-center justify-between text-[10px] mb-2"><span className="text-slate-400">Confidence: {(det.confidence * 100).toFixed(0)}%</span><span className="text-slate-500">Count: {det.count}</span></div>
                    {!det.resolved && (
                      <div className="flex space-x-2 mt-auto"><button onClick={() => resolveDetectionAlert(det.id)} className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 py-1.5 rounded text-xs font-medium transition-colors flex items-center justify-center active:scale-95"><CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Acknowledge</button></div>
                    )}
                    {det.resolved && <div className="text-[10px] text-slate-500 flex items-center mt-auto"><CheckCircle className="w-3 h-3 mr-1" /> Handled by Crew</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
      <nav className="fixed bottom-3 left-1/2 z-50 -translate-x-1/2 rounded-3xl border border-white/10 bg-slate-950/75 px-4 py-1.5 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className="flex items-end gap-2">
          {USE_CASES.map(({ id, label, Icon, accent }) => {
            const isActive = activeUseCase === id;
            return (
              <button
                key={id}
                onClick={() => setActiveUseCase(id)}
                className={`group flex min-w-[72px] flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[9px] font-semibold transition-all ${isActive ? 'text-white' : 'text-slate-400 hover:text-white'}`}
                title={label}
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${accent} shadow-lg transition-all ${isActive ? '-translate-y-1.5 scale-105 shadow-blue-500/20' : 'group-hover:-translate-y-1 group-hover:scale-105 opacity-80'}`}>
                  <Icon className="h-4 w-4 text-white" />
                </span>
                <span className="leading-tight">{label}</span>
                {isActive && <span className="h-0.5 w-0.5 rounded-full bg-white" />}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}