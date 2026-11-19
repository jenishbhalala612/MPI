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
Production artifacts will be placed in `dist/MPI_Frontend/browser`.

---

## ☁️ Deploying to Vercel

The project is fully configured for deployment on **Vercel** with automatic SPA routing and serverless function support for the `/api/records` endpoint and TOTP authentication.

### Method 1: Deploy via Vercel CLI (Fastest)

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Deploy to Preview**:
   ```bash
   vercel
   ```
   Follow the CLI prompts:
   - Link to existing project? **No** (or link to yours)
   - What's your project's name? `mpi-frontend`
   - In which directory is your code located? `./`
   - Want to modify these settings? **No** (the settings from `vercel.json` are auto-applied)

3. **Deploy to Production**:
   ```bash
   vercel --prod
   ```

### Method 2: Deploy via GitHub / GitLab / Bitbucket

1. Push your repository to **GitHub**.
2. Go to [vercel.com](https://vercel.com) and click **"Add New..."** → **"Project"**.
3. Import your repository.
4. Vercel automatically detects the project and applies `vercel.json`:
   - **Framework Preset**: Other / Angular
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist/MPI_Frontend/browser`
5. *(Optional)* Under **Environment Variables**, add:
   - `TOTP_SECRET`: Your custom TOTP secret key for Team Lead authentication (defaults to `MPSR2236TLREVKEY` if omitted).
   - *(Optional)* Vercel KV store (`KV_REST_API_URL` & `KV_REST_API_TOKEN`) for persistent cloud storage.
6. Click **Deploy**.
