# PACS Study Browser

A standalone, self-contained PACS Study Browser application designed for study management, querying, importing, and exporting DICOM studies. This application is decoupled from the MerilView DICOM Viewer, allowing independent development and deployment, while maintaining seamless integration through URL-based launching.

---

## Key Features

- **PACS Archive**: Complete study listing with expandable nested rows displaying series details.
- **Query & Filters**: Advanced search by Patient Name, Patient ID, Accession Number, Modalities, and Study Date/Range.
- **DICOM Import**: Drag-and-drop or file upload zone for importing local `.dcm` files with automatic metadata extraction.
- **DICOM Export**: Option to download raw DICOM instance files directly.
- **Viewer Integration**: A "View" action that launches the MerilView DICOM Viewer in a separate browser tab using the study's unique identifier.

---

## Tech Stack

### Frontend
- **Framework**: React 18 + Vite + TypeScript
- **Port**: `3005`
- **Icons**: Lucide React
- **Styling**: Vanilla CSS (Premium dark mode, glassmorphism, responsive grid, micro-animations)

### Backend
- **Framework**: Node.js + Express + TypeScript
- **Port**: `3001`
- **DICOM Parsing**: `dicom-parser`
- **Database**: Local JSON database (`data/db.json`) for persistence
- **File Upload**: `multer`

---

## Getting Started

### Prerequisites
- Node.js (version 20 or higher)
- npm (version 9 or higher)

### Installation

To install all dependencies for the root, frontend, and backend, run:

```bash
npm run install:all
```

### Running the Application

To run both the frontend and backend concurrently in development mode:

```bash
npm run dev
```

This will launch:
- **Frontend**: [http://localhost:3005](http://localhost:3005) (proxying `/api` to the backend)
- **Backend**: [http://localhost:3001](http://localhost:3001)

You can also run them independently:
```bash
npm run dev:frontend   # Starts React on port 3005
npm run dev:backend    # Starts Express on port 3001
```

---

## Integration with MerilView DICOM Viewer

The PACS Study Browser integrates with the MerilView DICOM Viewer via URL routing. When a user clicks the **View** button on a study:
1. The browser opens a new tab to:
   * **Development**: `http://localhost:5174/viewer/{studyInstanceUid}`
   * **Production Container**: `http://localhost:3000/viewer/{studyInstanceUid}`
2. MerilView intercepts the route and loads the study directly from its configured DICOMweb data source.
