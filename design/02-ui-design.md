# UI Design Specification

## 1. Page Structure

### 1.1 Page Overview

The system contains the following main pages:

| Page | Route | Function |
|------|-------|----------|
| Cabin Dashboard | `/` | Cabin overview, camera preview, alert events |
| Camera Management | `/cameras` | Camera list, add/edit/delete cameras |
| Camera Detail | `/camera/:id` | Single camera preview, AI configuration, detection results |
| AI Processing Config | `/ai` | Algorithm list, supported classes |

### 1.2 Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Header: Logo + Navigation + Status Indicator + Time        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                     Main Content Area                       │
│                                                             │
│    (Different pages based on route: Dashboard / Cameras / AI / ...)    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Cabin Crew Dashboard

### 2.1 Layout

```
┌────────────────────────────────────────────────────────────────────────┐
│ Header                                                                      │
│ ┌─────────┐    ┌──────────────────────────┐    ┌────────────────────┐   │
│ │  Logo   │    │  Flight Mode Selector   │    │ Connection Status  │   │
│ │ Airbus  │    │  [Boarding] [Taxi] [Cruise]  │     ● System Live    │   │
│ └─────────┘    └──────────────────────────┘    └────────────────────┘   │
├────────────────────────────────────────────────────────────────────────┤
│                          Main Content (Flex Ratio 1:4:1)                │
│                                                                        │
│  ┌──────────────┐   ┌────────────────────────────────┐   ┌─────────┐  │
│  │ Live Cameras │   │      Cabin Overview            │   │ Events  │  │
│  │              │   │      (A350 Top View)           │   │ Panel   │  │
│  │ [CAM 1]      │   │                                │   │         │  │
│  │ [CAM 2]      │   │  ┌────────────────────────┐   │   │ Alert 1 │  │
│  │ [CAM 3]      │   │  │      Cockpit          │   │   │ Alert 2 │  │
│  │ [CAM 4]      │   │  ├────────────────────────┤   │   │ Alert 3 │  │
│  │              │   │  │    Business Class     │   │   │         │  │
│  │              │   │  │    (1-2-1 layout)     │   │   │         │  │
│  │              │   │  ├────────────────────────┤   │   │         │  │
│  │              │   │  │    Economy Class     │   │   │         │  │
│  │              │   │  │    (2-4-2 layout)     │   │   │         │  │
│  │              │   │  └────────────────────────┘   │   │         │  │
│  └──────────────┘   └────────────────────────────────┘   └─────────┘  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Functional Areas

#### Header Area
- **Logo Area**: Aircraft icon + "Airbus Amber" + "Cabin Intelligence System"
- **Flight Phase Selector**: Boarding / Taxi / Cruise options
- **Connection Status**: Real-time connection status with backend (Online/Offline)
- **Time Display**: Current time (UTC+8)

#### Left Panel - Live Camera Feeds
- Camera list, click to navigate to camera detail page
- Each camera card displays: name, type, LIVE/OFFLINE status
- Anonymization toggle: ON/OFF to control passenger display

#### Center Panel - Cabin Overview
- A350 aircraft top view
- Seat status:
  - Green: Occupied
  - Border (empty): Unoccupied
  - Blue dot: Movement detected
  - Yellow flashing: Alert status (e.g., lavatory timeout)
- Area labels: Cockpit, Galley, Lavatory, Economy Class, Business Class

#### Right Panel - Events Panel
- Alert event list (categorized by type)
- Event types:
  - **Restricted** (red): Restricted area intrusion
  - **Suspicious** (orange): Suspicious behavior
  - **Wellbeing** (yellow): Passenger status anomaly
- AI detection events (blue)

---

## 3. Camera Management Page

### 3.1 Layout

```
┌────────────────────────────────────────────────────────────┐
│  Camera Management                        [+ Add Camera]   │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │ Camera Card     │  │ Camera Card     │  │ Camera Card │  │
│  │                 │  │                 │  │             │  │
│  │ ● CAM-001       │  │ ● CAM-002       │  │ ● CAM-003   │  │
│  │ Source: rtsp:// │  │ Source: usb:0   │  │ Source: ... │  │
│  │                 │  │                 │  │             │  │
│  │ [Edit] [Delete] │  │ [Edit] [Delete] │  │ [Edit] [Del]│  │
│  └─────────────────┘  └─────────────────┘  └─────────────┘  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 3.2 Add/Edit Camera Modal

```
┌─────────────────────────────────────────┐
│  Add Camera                        [X]  │
├─────────────────────────────────────────┤
│                                         │
│  Camera Name: [____________________]    │
│                                         │
│  Camera Type: [RTSP Stream       ▼]      │
│              - RTSP Stream              │
│              - USB Camera               │
│              - Integrated Camera       │
│                                         │
│  Source:                                │
│  [rtsp://192.168.1.100:554/stream___]  │
│                                         │
│  Enable camera on startup: [✓]          │
│                                         │
│         [Cancel]    [Add Camera]        │
└─────────────────────────────────────────┘
```

---

## 4. Camera Detail Page (CameraView)

### 4.1 Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Camera Name                                     [Fullscreen] [Back]      │
├─────────────────────────────────────────────────────────┬──────────────────┤
│                                                         │ AI Processing    │
│                                                         │                  │
│  ┌─────────────────────────────────────────────────┐   │ Algorithm:       │
│  │                                                 │   │ [Object Detect ▼]│
│  │              Live Video Stream                  │   │                  │
│  │              (with ROI overlay)                 │   │ Confidence:     │
│  │                                                 │   │ ──●────── 0.50   │
│  │                                                 │   │                  │
│  │                                                 │   │ [Draw ROI]      │
│  │                                                 │   │                  │
│  │                                                 │   │ Classes:        │
│  │                                                 │   │ [✓] person      │
│  │                                                 │   │ [ ] cup         │
│  │                                                 │   │ [ ] laptop      │
│  │                                                 │   │                  │
│  │                                                 │   │ [Capture&Analyze]│
│  └─────────────────────────────────────────────────┘   │                  │
│                                                         ├──────────────────┤
│                                                         │ Analysis Results │
│                                                         │                  │
│                                                         │ Processing: 45ms│
│                                                         │                  │
│                                                         │ Detections:     │
│                                                         │ person: 95.2%   │
│                                                         │ laptop: 87.3%   │
│                                                         │                  │
│                                                         │ [Annotated Img] │
├─────────────────────────────────────────────────────────┴──────────────────┤
│  Detection Messages                                    Live ●              │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │ Current Detection: person (95.2%), laptop (87.3%)                 │   │
│  └────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Feature Description

#### Video Preview Area
- Real-time video stream display
- ROI (Region of Interest) visualization
- ROI drawing feature: Click "Draw ROI" → Two clicks to select rectangular area
- Double-click to cancel current ROI selection

#### AI Configuration Panel
- **Algorithm Selection**: Object Detection / Classification
- **Confidence Adjustment**: 0.00 - 1.00 (default 0.50)
- **ROI Settings**: Define detection area
- **Class Filter**: Select object classes to detect

#### Results Display
- Processing time (milliseconds)
- Detection/classification result list
- Annotated image

---

## 5. AI Processing Configuration Page

### 5.1 Layout

```
┌────────────────────────────────────────────────────────────┐
│  AI Processing Configuration                               │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Available Algorithms                                      │
│  ┌────────────────────────────────────────────────────┐   │
│  │  YOLO Object Detection                              │   │
│  │  Detect objects in images using YOLOv8              │   │
│  │  Type: OBJECT_DETECTION                              │   │
│  └────────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────────┐   │
│  │  YOLO Image Classification                          │   │
│  │  Classify images using YOLOv8                       │   │
│  │  Type: CLASSIFICATION                               │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  Supported Classes (Object Detection)                     │
│  [person] [car] [dog] [cat] [...80+ classes]              │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## 6. Component State Specifications

### 6.1 Button States

| State | Style |
|-------|-------|
| Default | `bg-blue-600 text-white` |
| Hover | `bg-blue-500` |
| Active/Pressed | `bg-blue-700` |
| Disabled | `bg-gray-400 text-gray-600 cursor-not-allowed` |

### 6.2 Connection Status Indicator

| Status | Style |
|--------|-------|
| Connected | `bg-emerald-500/10 border-emerald-500/30 text-emerald-400` |
| Disconnected | `bg-red-500/10 border-red-500/30 text-red-400` |

### 6.3 Camera Status

| Status | Label Style |
|--------|-------------|
| Live | `bg-emerald-500/80 text-black` |
| Offline | `bg-slate-600/80 text-white` |

---

## 7. Color Specifications

### 7.1 Theme Colors

```css
/* Primary Colors */
Primary: #2563EB (Blue-600)
Primary Hover: #3B82F6 (Blue-500)
Primary Active: #1D4ED8 (Blue-700)

/* Background Colors */
Background Dark: #0F172A (Slate-900)
Background Card: #1E293B (Slate-800)
Border: #334155 (Slate-700)

/* Status Colors */
Success: #10B981 (Emerald-500)
Warning: #F59E0B (Amber-500)
Error: #EF4444 (Red-500)
Info: #3B82F6 (Blue-500)

/* Cabin Specific Colors */
Seat Occupied: #10B981 (Emerald-500)
Seat Empty: transparent with border
Alert Yellow: #F59E0B (Amber-500)
Moving Passenger: #60A5FA (Blue-400)
Cockpit: #EF4444 (Red-500)
Galley: #A855F7 (Purple-500)
```

---

## 8. Responsive Design

| Breakpoint | Description |
|------------|-------------|
| `sm` (640px) | Mobile landscape |
| `md` (768px) | Tablet |
| `lg` (1024px) | Laptop |
| `xl` (1280px) | Desktop |

Current design is primarily optimized for desktop (1280px+).
