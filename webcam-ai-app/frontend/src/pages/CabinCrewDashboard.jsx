import React, { useState, useEffect } from 'react';
import { AlertTriangle, Shield, ShieldOff, Video, Users, PlaneTakeoff, Plane, ShieldAlert, CheckCircle, Clock, Wifi, WifiOff, Maximize2 } from 'lucide-react';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import { cameraApi } from '../services/api';

const INITIAL_ALERTS = [
  { id: 1, time: '11:52', type: 'restricted', message: 'Passenger 29B moved towards cockpit area.', resolved: false },
  { id: 2, time: '11:45', type: 'suspicious', message: 'Passenger 37A moved to First Class.', resolved: true },
  { id: 3, time: '11:31', type: 'wellbeing', message: 'Lavatory A elapsed time over 20 minutes.', resolved: false },
];

const generatePassengerData = () => {
  const data = {};
  for (let row = 1; row <= 8; row++) {
    data[`${row}A`] = Math.random() > 0.3;
    data[`${row}D`] = Math.random() > 0.3;
    data[`${row}G`] = Math.random() > 0.3;
    data[`${row}K`] = Math.random() > 0.3;
  }
  for (let row = 9; row <= 25; row++) {
    data[`${row}A`] = Math.random() > 0.2;
    data[`${row}B`] = Math.random() > 0.2;
    data[`${row}C`] = Math.random() > 0.2;
    data[`${row}D`] = Math.random() > 0.2;
    data[`${row}E`] = Math.random() > 0.2;
    data[`${row}F`] = Math.random() > 0.2;
    data[`${row}G`] = Math.random() > 0.2;
    data[`${row}H`] = Math.random() > 0.2;
  }
  return data;
};

const PASSENGER_DATA = generatePassengerData();

const MOVING_PASSENGERS = [
  { position: 'business', row: 2, side: 'left' },
  { position: 'business', row: 5, side: 'right' },
  { position: 'economy', row: 15, side: 'middle' },
  { position: 'economy', row: 28, side: 'left' },
  { position: 'economy', row: 35, side: 'right' },
];

export default function CabinCrewDashboard() {
  const navigate = useNavigate();
  const [flightMode, setFlightMode] = useState('cruise');
  const [anonymize, setAnonymize] = useState(true);
  const [alerts, setAlerts] = useState(INITIAL_ALERTS);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const [isConnected, setIsConnected] = useState(false);
  const [passengers, setPassengers] = useState(PASSENGER_DATA);
  const [cameras, setCameras] = useState([]);
  const [loadingCameras, setLoadingCameras] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 60000);

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

    socket.on('new_alert', (newAlert) => {
      setAlerts(prevAlerts => [newAlert, ...prevAlerts]);
    });

    const passengerTimer = setInterval(() => {
      setPassengers(prev => {
        const newPassengers = { ...prev };
        const seats = Object.keys(newPassengers);
        const randomSeat = seats[Math.floor(Math.random() * seats.length)];
        newPassengers[randomSeat] = !newPassengers[randomSeat];
        return newPassengers;
      });
    }, 5000);

    return () => {
      clearInterval(timer);
      clearInterval(passengerTimer);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const loadCameras = async () => {
      try {
        setLoadingCameras(true);
        const data = await cameraApi.list();
        setCameras(data);
      } catch (err) {
        console.error('Failed to load cameras:', err);
      } finally {
        setLoadingCameras(false);
      }
    };
    loadCameras();
  }, []);

  const resolveAlert = (id) => {
    setAlerts(alerts.map(a => a.id === id ? { ...a, resolved: true } : a));
  };

  const unreadAlertsCount = alerts.filter(a => !a.resolved).length;

  const isSeatOccupied = (seatId) => {
    return passengers[seatId] || false;
  };

  return (
    <div className="h-screen bg-slate-900 text-slate-100 font-sans flex flex-col overflow-hidden">
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

      {/* Main layout: Camera Feeds (left) | Cabin Overview (center) | Events (right) - Ratio 1:4:1 */}
      <main className="flex-1 p-2 flex gap-2 min-h-0 overflow-hidden w-full">

        {/* Camera Feeds - Left Panel (vertical listing) - 1 part */}
        <div className="flex-1 bg-slate-800 rounded-xl border border-slate-700 p-3 flex flex-col overflow-hidden" style={{flex: 1}}>
          <div className="flex items-center justify-between mb-3 shrink-0">
            <h2 className="font-semibold flex items-center text-sm">
              <Video className="w-4 h-4 mr-2 text-blue-400" /> Live Camera Feeds
            </h2>
            <button
              onClick={() => setAnonymize(!anonymize)}
              className={`flex items-center px-2 py-1 rounded text-[10px] font-medium transition-colors ${anonymize ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}
            >
              {anonymize ? <Shield className="w-3 h-3 mr-1" /> : <ShieldOff className="w-3 h-3 mr-1" />}
              {anonymize ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="flex-1 flex flex-col gap-2 overflow-y-auto">
            {loadingCameras ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-slate-400 text-sm">Loading cameras...</div>
              </div>
            ) : cameras.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Video className="w-12 h-12 text-slate-600 mb-3" />
                <div className="text-slate-400 text-sm mb-2">No cameras added</div>
                <div className="text-slate-500 text-xs">Add cameras in the "Cameras" tab</div>
              </div>
            ) : (
              cameras.map((camera, index) => (
                <div 
                  key={camera.id} 
                  className="bg-black rounded-lg border border-slate-700 relative overflow-hidden cursor-pointer hover:border-blue-500 transition-colors"
                  onClick={() => navigate(`/camera/${camera.id}`)}
                >
                  {/* 16:9 aspect ratio container */}
                  <div className="aspect-video w-full bg-slate-900">
                    {camera.enabled ? (
                      <img 
                        src={cameraApi.getStreamUrl(camera.id)} 
                        alt={camera.name} 
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = `https://images.unsplash.com/photo-1540339832862-474589b0a11b?auto=format&fit=crop&w=800&q=80`;
                          e.target.className = 'w-full h-full object-cover opacity-40';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-800">
                        <div className="text-slate-500 text-xs">Camera Offline</div>
                      </div>
                    )}
                  </div>
                  <div className="absolute top-1.5 left-1.5 bg-black/60 px-1.5 py-0.5 rounded text-[9px] font-mono shadow">
                    CAM {index + 1}: {camera.name}
                  </div>
                  <div className={`absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold ${camera.enabled ? 'bg-emerald-500/80 text-black' : 'bg-slate-600/80 text-white'}`}>
                    {camera.enabled ? 'LIVE' : 'OFFLINE'}
                  </div>
                  <div className="absolute top-1.5 right-1.5 bg-black/60 px-1.5 py-0.5 rounded text-[8px] text-slate-300">
                    {camera.type.toUpperCase()}
                  </div>
                  <button 
                    className="absolute bottom-1.5 left-1.5 bg-blue-600/80 hover:bg-blue-500 p-1 rounded transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/camera/${camera.id}`);
                    }}
                    title="Open camera view"
                  >
                    <Maximize2 className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Cabin Overview - Center Panel - 4 parts */}
        <div className="flex-1 flex flex-col gap-2 min-h-0" style={{flex: 4}}>
          <div className="flex-1 bg-slate-800 rounded-xl border border-slate-700 p-3 flex flex-col min-h-0 overflow-hidden">
            <div className="flex justify-between items-center mb-3 shrink-0">
              <h2 className="font-semibold flex items-center text-sm">
                <Plane className="w-4 h-4 mr-2 text-indigo-400" /> Cabin Overview (A350 Top View)
              </h2>
              <div className="flex space-x-3 text-xs">
                <div className="flex items-center"><div className="w-2.5 h-2.5 bg-emerald-500 rounded mr-1.5"></div> Occupied</div>
                <div className="flex items-center"><div className="w-2.5 h-2.5 bg-transparent border border-slate-500 rounded mr-1.5"></div> Empty</div>
                <div className="flex items-center"><div className="w-2.5 h-2.5 bg-yellow-500 rounded mr-1.5"></div> Alert</div>
                <div className="flex items-center"><div className="w-2.5 h-2.5 bg-blue-400 rounded-full mr-1.5"></div> Moving</div>
              </div>
            </div>

            <div className="flex-1 bg-slate-900 rounded-lg border border-slate-800 overflow-y-auto overflow-x-hidden">
              <div className="min-h-full">
                <div className="flex flex-col">
                  {/* Cockpit */}
                  <div className="bg-red-500/20 border-b-2 border-red-500/50 flex items-center justify-center py-3">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                      <span className="text-xs font-bold text-red-400">COCKPIT</span>
                      <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                    </div>
                  </div>

                  {/* Galley */}
                  <div className="bg-purple-500/20 border-y-2 border-purple-500/30 flex items-center justify-center py-2">
                    <span className="text-[8px] text-purple-400 font-bold tracking-widest">GALLEY</span>
                  </div>

                  {/* Business Class - 1-2-1 layout */}
                  <div className="bg-slate-800/50">
                    <div className="bg-slate-800 border-b border-slate-700 p-2">
                      <span className="text-[10px] text-slate-400 font-bold tracking-widest ml-2">BUSINESS CLASS (1-2-1) - Rows 1-8</span>
                    </div>
                    <div className="grid grid-rows-8 gap-1 p-2">
                      {[1, 2, 3, 4, 5, 6, 7, 8].map(row => (
                        <div key={row} className="flex gap-3 items-center">
                          {/* Left single seat */}
                          <div className="flex-1 flex justify-end px-2">
                            <div 
                              className={`w-14 h-10 rounded-lg border-2 flex items-center justify-center text-[8px] font-medium transition-all ${
                                isSeatOccupied(`${row}A`) 
                                  ? 'bg-emerald-500/70 border-emerald-400 text-white shadow-lg shadow-emerald-500/30' 
                                  : 'bg-transparent border-slate-600 text-slate-400'
                              }`}
                            >
                              {row}A
                            </div>
                          </div>
                          
                          {/* Left aisle */}
                          <div className="w-12 bg-slate-700/30 rounded-lg relative flex-shrink-0">
                            {MOVING_PASSENGERS.find(p => p.position === 'business' && p.row === row && p.side === 'left') && (
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-blue-400 rounded-full animate-bounce shadow-lg shadow-blue-400/50"></div>
                            )}
                          </div>
                          
                          {/* Middle two seats */}
                          <div className="flex-1 flex gap-2 justify-center">
                            <div 
                              className={`w-14 h-10 rounded-lg border-2 flex items-center justify-center text-[8px] font-medium transition-all ${
                                isSeatOccupied(`${row}D`) 
                                  ? 'bg-emerald-500/70 border-emerald-400 text-white shadow-lg shadow-emerald-500/30' 
                                  : 'bg-transparent border-slate-600 text-slate-400'
                              }`}
                            >
                              {row}D
                            </div>
                            <div 
                              className={`w-14 h-10 rounded-lg border-2 flex items-center justify-center text-[8px] font-medium transition-all ${
                                isSeatOccupied(`${row}G`) 
                                  ? 'bg-emerald-500/70 border-emerald-400 text-white shadow-lg shadow-emerald-500/30' 
                                  : 'bg-transparent border-slate-600 text-slate-400'
                              }`}
                            >
                              {row}G
                            </div>
                          </div>
                          
                          {/* Right aisle */}
                          <div className="w-12 bg-slate-700/30 rounded-lg relative flex-shrink-0">
                            {MOVING_PASSENGERS.find(p => p.position === 'business' && p.row === row && p.side === 'right') && (
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-blue-400 rounded-full animate-bounce shadow-lg shadow-blue-400/50"></div>
                            )}
                          </div>
                          
                          {/* Right single seat */}
                          <div className="flex-1 flex justify-start px-2">
                            <div 
                              className={`w-14 h-10 rounded-lg border-2 flex items-center justify-center text-[8px] font-medium transition-all ${
                                isSeatOccupied(`${row}K`) 
                                  ? 'bg-emerald-500/70 border-emerald-400 text-white shadow-lg shadow-emerald-500/30' 
                                  : 'bg-transparent border-slate-600 text-slate-400'
                              }`}
                            >
                              {row}K
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Lavatories */}
                  <div className="flex">
                    <div className="flex-1 bg-yellow-500/20 border-y border-yellow-500/30 flex items-center justify-center py-2 relative">
                      <div className="absolute inset-0 border border-yellow-500/50 animate-pulse"></div>
                      <span className="text-[10px] text-yellow-400 font-bold">LAV A</span>
                    </div>
                    <div className="flex-1 bg-yellow-500/20 border-y border-yellow-500/30 flex items-center justify-center py-2">
                      <span className="text-[10px] text-yellow-400 font-bold">LAV B</span>
                    </div>
                  </div>

                  {/* Economy Class - 2-4-2 layout with 17 rows (9-25) */}
                  <div className="bg-slate-800/30">
                    <div className="bg-slate-800 border-b border-slate-700 p-2">
                      <span className="text-[10px] text-slate-400 font-bold tracking-widest ml-2">ECONOMY CLASS (2-4-2) - Rows 9-25</span>
                    </div>
                    <div className="grid grid-rows-17 gap-0.5 p-2">
                      {[9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25].map(row => (
                        <div key={row} className="flex gap-2 items-center">
                          {/* Left two seats */}
                          <div className="flex-1 flex gap-1 justify-end px-1">
                            <div 
                              className={`w-12 h-9 rounded-lg border flex items-center justify-center text-[7px] font-medium transition-all ${
                                isSeatOccupied(`${row}A`) 
                                  ? 'bg-emerald-500/70 border-emerald-400 text-white shadow shadow-emerald-500/30' 
                                  : 'bg-transparent border-slate-600 text-slate-400'
                              }`}
                            >
                              {row}A
                            </div>
                            <div 
                              className={`w-12 h-9 rounded-lg border flex items-center justify-center text-[7px] font-medium transition-all ${
                                isSeatOccupied(`${row}B`) 
                                  ? 'bg-emerald-500/70 border-emerald-400 text-white shadow shadow-emerald-500/30' 
                                  : 'bg-transparent border-slate-600 text-slate-400'
                              }`}
                            >
                              {row}B
                            </div>
                          </div>
                          
                          {/* Left aisle */}
                          <div className="w-10 bg-slate-700/30 rounded-lg relative flex-shrink-0">
                            {MOVING_PASSENGERS.find(p => p.position === 'economy' && p.row === row && p.side === 'left') && (
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-blue-400 rounded-full animate-bounce shadow shadow-blue-400/50"></div>
                            )}
                          </div>
                          
                          {/* Middle four seats */}
                          <div className="flex-1 flex gap-1 justify-center">
                            <div 
                              className={`w-12 h-9 rounded-lg border flex items-center justify-center text-[7px] font-medium transition-all ${
                                isSeatOccupied(`${row}C`) 
                                  ? 'bg-emerald-500/70 border-emerald-400 text-white shadow shadow-emerald-500/30' 
                                  : 'bg-transparent border-slate-600 text-slate-400'
                              }`}
                            >
                              {row}C
                            </div>
                            <div 
                              className={`w-12 h-9 rounded-lg border flex items-center justify-center text-[7px] font-medium transition-all ${
                                isSeatOccupied(`${row}D`) 
                                  ? 'bg-emerald-500/70 border-emerald-400 text-white shadow shadow-emerald-500/30' 
                                  : 'bg-transparent border-slate-600 text-slate-400'
                              }`}
                            >
                              {row}D
                            </div>
                            <div 
                              className={`w-12 h-9 rounded-lg border flex items-center justify-center text-[7px] font-medium transition-all ${
                                isSeatOccupied(`${row}E`) 
                                  ? 'bg-emerald-500/70 border-emerald-400 text-white shadow shadow-emerald-500/30' 
                                  : 'bg-transparent border-slate-600 text-slate-400'
                              }`}
                            >
                              {row}E
                            </div>
                            <div 
                              className={`w-12 h-9 rounded-lg border flex items-center justify-center text-[7px] font-medium transition-all ${
                                isSeatOccupied(`${row}F`) 
                                  ? 'bg-emerald-500/70 border-emerald-400 text-white shadow shadow-emerald-500/30' 
                                  : 'bg-transparent border-slate-600 text-slate-400'
                              }`}
                            >
                              {row}F
                            </div>
                          </div>
                          
                          {/* Right aisle */}
                          <div className="w-10 bg-slate-700/30 rounded-lg relative flex-shrink-0">
                            {MOVING_PASSENGERS.find(p => p.position === 'economy' && p.row === row && (p.side === 'right' || p.side === 'middle')) && (
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-blue-400 rounded-full animate-bounce shadow shadow-blue-400/50"></div>
                            )}
                          </div>
                          
                          {/* Right two seats */}
                          <div className="flex-1 flex gap-1 justify-start px-1">
                            <div 
                              className={`w-12 h-9 rounded-lg border flex items-center justify-center text-[7px] font-medium transition-all ${
                                isSeatOccupied(`${row}G`) 
                                  ? 'bg-emerald-500/70 border-emerald-400 text-white shadow shadow-emerald-500/30' 
                                  : 'bg-transparent border-slate-600 text-slate-400'
                              }`}
                            >
                              {row}G
                            </div>
                            <div 
                              className={`w-12 h-9 rounded-lg border flex items-center justify-center text-[7px] font-medium transition-all ${
                                isSeatOccupied(`${row}H`) 
                                  ? 'bg-emerald-500/70 border-emerald-400 text-white shadow shadow-emerald-500/30' 
                                  : 'bg-transparent border-slate-600 text-slate-400'
                              }`}
                            >
                              {row}H
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Lavatories */}
                  <div className="flex">
                    <div className="flex-1 bg-yellow-500/20 border-y border-yellow-500/30 flex items-center justify-center py-2">
                      <span className="text-[10px] text-yellow-400 font-bold">LAV C</span>
                    </div>
                    <div className="flex-1 bg-yellow-500/20 border-y border-yellow-500/30 flex items-center justify-center py-2 relative">
                      <div className="absolute inset-0 border border-yellow-500/50 animate-pulse"></div>
                      <span className="text-[10px] text-yellow-400 font-bold">LAV D</span>
                    </div>
                  </div>

                  {/* Galley */}
                  <div className="bg-purple-500/20 border-y-2 border-purple-500/30 flex items-center justify-center py-2">
                    <span className="text-[10px] text-purple-400 font-bold tracking-widest">GALLEY</span>
                  </div>

                  {/* Rear Cargo */}
                  <div className="bg-slate-700/50 border-t-2 border-slate-600/50 flex items-center justify-center py-3">
                    <span className="text-[10px] text-slate-400 font-bold tracking-widest">REAR CARGO</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Events Panel - Right Panel - 1 part */}
        <div className="flex-1 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden" style={{flex: 1}}>
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

          <div className="p-3 space-y-2 overflow-y-auto" style={{height: 'calc(100% - 52px)'}}>
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