# MPI Sheet Email Sender — Angular Frontend

Modern dark-themed Angular frontend for the **MPI Sheet System**, allowing users to specify From/To email addresses, draft multiline inspection points, preview the generated QuestPDF document in real time, and dispatch the PDF attachment via email.

---

## ✨ Features

- **Dark Theme Matching UI Mockup**: Styled with sleek charcoal cards, pill inputs, custom scrollbars, and vibrant status badges.
- **Real-Time PDF Preview**: Connected to `POST /api/mpi/preview`, returning raw PDF bytes rendered in an interactive embedded viewer (`iframe` + `DomSanitizer`).
- **Email Dispatching**: Connected to `POST /api/mpi/send`, delivering the PDF attachment with clear success/error notifications.
- **Smooth Loaders & Interactive Feedback**:
  - Button spinner states (`Generating Preview...`, `Sending Email...`)
  - Animated pulsing skeleton in the preview container during generation
  - Floating toast notification system for success, warning, and error messages
- **Preload & Quick Helpers**:
  - **Fill Sample**: 1-click test data loader
  - **Clear**: Form reset button
  - **Point Counter**: Dynamic badge displaying detected points
  - **Download & Popout**: Instant download of `MPI_Sheet.pdf` and popout into a separate browser tab
- **Configurable Backend Target**: Default is `http://localhost:5135/api/mpi` with built-in health ping and quick endpoint customization.

---

## 🚀 Getting Started

### 1. Ensure Backend is Running
In a separate terminal or Visual Studio:
```powershell
cd BACKEND\MPI_Sheet
dotnet run
```
*(Backend runs on `http://localhost:5135` or `https://localhost:7063` with Swagger at `/swagger`)*

### 2. Start Angular Development Server
```powershell
cd FRONTEND\MPI_Frontend
npm start
```
Navigate your browser to:
👉 **`http://localhost:4200`**

---

## 🧪 Testing & Building

### Run Unit Tests
```powershell
npm test
```

### Build for Production
```powershell
npm run build
```
Production artifacts will be placed in `dist/MPI_Frontend`.
