# AirBus Amber - Cabin Intelligence System Design

This document provides complete design specifications for the AirBus Amber Cabin Intelligence System, intended for:
- Communicating requirements and feature design with Product Managers
- Defining integration interfaces with the Algorithm Team

---

## Table of Contents

1. [System Overview](01-architecture.md) - System positioning, functional scope, overall architecture
2. [Architecture Design](01-architecture.md#architecture-design) - Microservices architecture, tech stack, deployment
3. [UI Design](02-ui-design.md) - Interface layout, interaction flows, component specifications
4. [Sequence Diagrams](03-sequence-diagrams.md) - UML sequence diagrams for core business processes
5. [Algorithm Specification](04-algorithm-spec.md) - AI model requirements, input/output specifications
6. [API Integration](05-api-integration.md) - Interface specifications for algorithm team integration

---

## System Overview

### Project Background

AirBus Amber is a computer vision-based aviation cabin intelligent monitoring system designed to:
- Real-time monitoring of cabin status (passenger positions, behaviors, anomaly events)
- Provide decision support for cabin crew
- Enhance flight safety and passenger experience

### Core Features

| Module | Description |
|--------|-------------|
| Camera Management | Support RTSP/USB/Integrated cameras, real-time video streaming |
| AI Detection | YOLOv8-based object detection and image classification |
| Real-time Alerts | Timely alerts when anomalous behaviors are detected |
| Cabin Dashboard | Visual display of cabin status and alert events |

### Technical Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
│         Cabin Dashboard / Camera Management              │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP/REST
┌───────────────────────┴─────────────────────────────────┐
│              Backend Service (FastAPI)                  │
│         Camera Management / Streaming / Events           │
└───────┬─────────────────────────────┬───────────────────┘
        │                             │
┌───────┴───────┐           ┌─────────┴────────┐
│  RTSP Camera  │           │   AI Service     │
│    Streams    │           │   (YOLOv8)       │
└───────────────┘           └──────────────────┘
```

---

## Document Version

| Version | Date | Author | Change Description |
|---------|------|--------|-------------------|
| 1.0 | 2026-06-14 | - | Initial version |

---

## Contacts

- **Product Manager**: [TBD]
- **Algorithm Team Lead**: [TBD]
- **Development Team**: [TBD]
