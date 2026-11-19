const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\jenis\\.gemini\\antigravity\\brain\\1ad0497d-5ac0-4fdc-be41-1b442181c47d';
const DIST_DIR = path.join(__dirname, 'dist', 'MPI_Frontend', 'browser');
const PORT = 4215;
const APP_URL = `http://localhost:${PORT}`;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.png': 'image/png'
};

function createStaticServer() {
  let e2eRecordsStore = {};
  const recordsJsonPath = path.join(DIST_DIR, 'records.json');
  if (fs.existsSync(recordsJsonPath)) {
    try {
      e2eRecordsStore = JSON.parse(fs.readFileSync(recordsJsonPath, 'utf8'));
    } catch (e) {}
  }

  return http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];

    // API Endpoint Mock for /api/records
    if (reqPath === '/api/records') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, data: e2eRecordsStore }));
        return;
      }

      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const payload = JSON.parse(body);
            const emp = payload.employeeName.trim();
            const month = payload.monthYear.trim().toUpperCase();
            if (!e2eRecordsStore[emp]) e2eRecordsStore[emp] = {};
            const updated = {
              ...payload,
              updatedAt: new Date().toISOString()
            };
            e2eRecordsStore[emp][month] = updated;
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: true, data: updated }));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
        return;
      }
    }

    if (reqPath === '/' || reqPath === '' || reqPath.startsWith('/review')) reqPath = '/index.html';

    let filePath = path.join(DIST_DIR, reqPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Server Error: ' + err.message);
      } else {
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(content);
      }
    });
  });
}

async function runE2ETests() {
  console.log('🚀 Starting Browser End-to-End Testing on Production Bundle:', DIST_DIR);

  const server = createStaticServer();
  await new Promise(resolve => server.listen(PORT, resolve));
  console.log(`🌐 In-Process Static Server running at: ${APP_URL}`);

  let browser;
  const testResults = [];

  function recordTest(name, passed, details = '') {
    testResults.push({ name, passed, details });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${mark}: ${name} ${details ? `(${details})` : ''}`);
  }

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,960']
    });

    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    await page.setViewport({ width: 1440, height: 960 });

    // 1. Navigate to App
    await page.goto(APP_URL, { waitUntil: 'networkidle0', timeout: 15000 });
    const title = await page.$eval('.card-title', el => el.textContent.trim());
    recordTest('App Loaded Successfully', title.includes('MPI Sheet Generator'), `Title: "${title}"`);

    // 2. Verify Employee Name placeholder is "Your Name"
    const empPlaceholder = await page.$eval('#employeeName', el => el.placeholder);
    recordTest('Employee Name placeholder is "Your Name"', empPlaceholder === 'Your Name', `Placeholder: "${empPlaceholder}"`);

    // 3. Verify Editable Month & Year Input
    const monthYearInput = await page.$('#monthYear');
    recordTest('Month & Year input element exists', monthYearInput !== null);

    const isMonthYearReadonly = await page.$eval('#monthYear', el => el.readOnly || el.disabled);
    recordTest('Month & Year input is fully editable (not readonly or disabled)', !isMonthYearReadonly);

    const defaultMonthYearVal = await page.$eval('#monthYear', el => el.value);
    recordTest('Month & Year defaults to current period', defaultMonthYearVal.length > 3, `Default: "${defaultMonthYearVal}"`);

    // 4. Verify Initial empty state
    const empValInitial = await page.$eval('#employeeName', el => el.value);
    recordTest('Employee Name initially empty', empValInitial === '', `Value: "${empValInitial}"`);

    const ptsValInitial = await page.$eval('#points', el => el.value);
    recordTest('Points initially empty', ptsValInitial === '', `Value: "${ptsValInitial}"`);

    // Save screenshot of initial state
    const ss1Path = path.join(ARTIFACTS_DIR, 'e2e_screenshot_1_initial.png');
    await page.screenshot({ path: ss1Path, fullPage: true });

    // 4. TEST USER REQUEST: Clicking Preview when empty MUST NOT auto-fill dummy data!
    console.log('🔄 Testing Preview on Empty Form (Must NOT auto-fill data)...');
    const previewBtn = await page.$('.preview-btn');
    await previewBtn.click();
    await new Promise(r => setTimeout(r, 600));

    // Verify employee name and points are STILL EMPTY
    const empValAfterEmptyClick = await page.$eval('#employeeName', el => el.value);
    recordTest('Employee Name is NOT auto-filled on empty preview click', empValAfterEmptyClick === '', `Value: "${empValAfterEmptyClick}"`);

    const ptsValAfterEmptyClick = await page.$eval('#points', el => el.value);
    recordTest('Points are NOT auto-filled on empty preview click', ptsValAfterEmptyClick === '', `Value: "${ptsValAfterEmptyClick}"`);

    // Verify validation toast appeared
    const toastVisible = await page.$eval('.toast-title', el => el.textContent.trim()).catch(() => '');
    const toastMessage = await page.$eval('.toast-message', el => el.textContent.trim()).catch(() => '');
    recordTest('Validation toast displayed for empty submission', toastVisible.includes('Validation') || toastMessage.includes('Points cannot be empty'), `Toast: "${toastVisible}" - "${toastMessage}"`);

    // Verify sheet preview is NOT rendered inline or in modal
    const sheetBeforeFill = await page.$('.sheet-paper');
    recordTest('Sheet preview is NOT rendered when form is empty', sheetBeforeFill === null);

    const modalBeforeFill = await page.$('.modal-backdrop');
    recordTest('Modal popup is NOT opened when form is empty', modalBeforeFill === null);

    const inlinePreviewBeforeFill = await page.$('.mpi-card .pdf-preview-container');
    recordTest('Inline preview is NOT embedded in main card screen', inlinePreviewBeforeFill === null);

    const ssEmptyPath = path.join(ARTIFACTS_DIR, 'e2e_screenshot_empty_preview_blocked.png');
    await page.screenshot({ path: ssEmptyPath, fullPage: true });

    // 5. Fill out the form with custom data & custom month/year
    console.log('✍️ Filling form with custom data & custom month/year...');
    await page.focus('#employeeName');
    await page.type('#employeeName', 'Alex Johnson');
    await new Promise(r => setTimeout(r, 200));

    // Custom Month & Year
    await page.$eval('#monthYear', (el, text) => {
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, 'OCTOBER 2026');

    const samplePoints =
`3Pillar – Tasks
1. Completed implementation, API analysis, and PR activities for PNMA-14993, PNMA-15137, and PNMA-15612.
2. Completed PNMA-15049 spike implementation, testing, and documentation.
3. Performed root-cause analysis, bug investigation, and ticket validation.
4. Created technical and testing documents and shared findings with the team.
5. Participated in planning, refinement, stand-ups, and team demos.
6. Supported team members with KT, PR reviews, and technical queries.
7. Investigated pipeline and SonarQube issues.
ThinkBridge – Tasks
1. Completed project KT and analyzed application workflows and ERP documentation.
2. Tested LeMans APIs using Postman and shared the collection.
3. Completed database migration and integrated real data into the Dev environment.
4. Implemented Sales Campaign functionality, including Sales Order linking and bulk uploads.
5. Fixed Core Items and Campaigns bugs, validations, filters, and UI issues.
6. Developed Inventory Management features, including Overview, Stock Position, and All Movements.
7. Implemented warehouse filters, allocation, movement tracking, and transfer-related functionality.
8. Completed feedback fixes, raised PRs, and merged changes into Dev.
9. Created Power BI reports and investigated database data discrepancies.
10. Coordinated with the Infor team for inventory and PGA data integration.
11. Supported team members with tunnel setup, PR reviews, and database connectivity.`;

    await page.$eval('#points', (el, text) => {
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, samplePoints);

    await page.$eval('#extraCurricularActivity', (el, text) => {
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, 'Actively participated in internal technical workshops, safety drills, and ISO quality compliance training.');

    await new Promise(r => setTimeout(r, 200));

    const ss2Path = path.join(ARTIFACTS_DIR, 'e2e_screenshot_2_filled.png');
    await page.screenshot({ path: ss2Path, fullPage: true });

    // 6. Click Preview with filled data - opens in Popup Modal
    console.log('🔄 Triggering Preview with filled data (Opening Modal Popup)...');
    await previewBtn.click();
    await page.waitForSelector('.modal-backdrop', { visible: true, timeout: 8000 });
    await page.waitForSelector('.preview-modal-dialog', { visible: true, timeout: 8000 });
    await page.waitForSelector('.sheet-paper', { visible: true, timeout: 8000 });
    await new Promise(r => setTimeout(r, 800));

    const modalBackdrop = await page.$('.modal-backdrop');
    recordTest('Preview opens in a dedicated Modal Popup (not in that screen)', modalBackdrop !== null);

    const sheetViewer = await page.$('.preview-modal-dialog .sheet-paper');
    recordTest('High-Fidelity Visual A4 Sheet rendered inside Modal Popup', sheetViewer !== null);

    const sheetEmpName = await page.$eval('.sheet-emp-name', el => el.textContent.trim());
    recordTest('Sheet Header displays user entered name "Alex Johnson"', sheetEmpName === 'Alex Johnson');

    const sheetDate = await page.$eval('.sheet-date', el => el.textContent.trim());
    recordTest('Sheet Header displays user edited month/year "OCTOBER 2026"', sheetDate === 'OCTOBER 2026', `Date: "${sheetDate}"`);

    const defaultAppActionBtn = await page.$('.modal-action-btn.default-app-action-btn');
    recordTest('"Default App" action button removed from Modal Header per user request', defaultAppActionBtn === null);

    const downloadActionBtn = await page.$('.modal-action-btn.download-action-btn');
    recordTest('Modal Header includes "Download" action button', downloadActionBtn !== null);

    const closeBtn = await page.$('.modal-close-btn');
    recordTest('Modal Header includes Close button', closeBtn !== null);

    // 7. Verify Spacing: Rating boxes are NOT touching the review boxes below them!
    const spacingCheck = await page.evaluate(() => {
      const sections = Array.from(document.querySelectorAll('.sheet-section'));
      const results = [];

      for (const sec of sections) {
        const titleEl = sec.querySelector('.sheet-section-title');
        const titleText = titleEl ? titleEl.textContent.trim() : '';
        const ratingBox = sec.querySelector('.sheet-rating-box');
        const cardBox = sec.querySelector('.sheet-card-box');

        if (ratingBox && cardBox) {
          const rRect = ratingBox.getBoundingClientRect();
          const cRect = cardBox.getBoundingClientRect();
          const verticalGap = cRect.top - rRect.bottom;
          results.push({
            section: titleText,
            ratingBottom: rRect.bottom,
            cardTop: cRect.top,
            verticalGap: verticalGap,
            notTouching: verticalGap > 0
          });
        }
      }
      return results;
    });

    for (const sc of spacingCheck) {
      recordTest(
        `Rating box has breathing room in "${sc.section}" (gap >= 4px, not touching)`,
        sc.notTouching && sc.verticalGap >= 4,
        `Gap: ${sc.verticalGap.toFixed(1)}px`
      );
    }

    // 8. Verify Bottom of page spacing
    const bottomSpacing = await page.evaluate(() => {
      const sheet = document.querySelector('.sheet-paper');
      const footer = document.querySelector('.sheet-footer');
      const sections = Array.from(document.querySelectorAll('.sheet-section'));
      const lastSection = sections[sections.length - 1]; // HR Review & Approval

      if (!sheet || !footer || !lastSection) return null;
      const sRect = sheet.getBoundingClientRect();
      const fRect = footer.getBoundingClientRect();
      const lastRect = lastSection.getBoundingClientRect();

      return {
        gapBetweenHRAndFooter: fRect.top - lastRect.bottom,
        spaceBelowFooter: sRect.bottom - fRect.bottom
      };
    });

    if (bottomSpacing) {
      recordTest(
        'Clean layout at bottom of sheet (HR card sits comfortably above footer)',
        bottomSpacing.gapBetweenHRAndFooter >= 8,
        `Gap to footer: ${bottomSpacing.gapBetweenHRAndFooter.toFixed(1)}px`
      );
    }

    // Capture Desktop Modal Preview screenshot
    const ss3Path = path.join(ARTIFACTS_DIR, 'e2e_screenshot_desktop_preview_modal.png');
    await page.screenshot({ path: ss3Path, fullPage: false });

    const ssDesktopDesignPath = path.join(ARTIFACTS_DIR, 'e2e_screenshot_desktop_design.png');
    fs.copyFileSync(ss3Path, ssDesktopDesignPath);
    recordTest('Desktop modal preview screenshot saved', fs.existsSync(ssDesktopDesignPath));

    // Test Closing Modal Popup
    console.log('🔄 Closing Modal Popup to inspect clean main screen...');
    await page.$eval('.modal-close-btn', el => el.click());
    await page.waitForSelector('.modal-backdrop', { hidden: true, timeout: 5000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 400));

    const modalAfterClose = await page.$('.modal-backdrop');
    recordTest('Modal popup closed cleanly via Close button', modalAfterClose === null);

    const inlinePreviewAfterClose = await page.$('.mpi-card .pdf-preview-container');
    recordTest('Main card screen has NO inline preview container (clean UI)', inlinePreviewAfterClose === null);

    const ssCleanScreenPath = path.join(ARTIFACTS_DIR, 'e2e_screenshot_desktop_clean_screen.png');
    await page.screenshot({ path: ssCleanScreenPath, fullPage: true });

    // 9. Verify Action Buttons on Main Card
    const sendBtn = await page.$('.send-btn');
    recordTest('Send button successfully removed from UI', sendBtn === null);

    const shareBtn = await page.$('.share-btn');
    recordTest('Share button successfully removed from UI', shareBtn === null);

    const emailInput = await page.$('#recipientEmail');
    recordTest('Email recipient input removed from UI', emailInput === null);

    const defaultAppBtn = await page.$('.default-app-btn');
    recordTest('"Default App" button removed from main card per user request', defaultAppBtn === null);

    const docSpecCard = await page.$('.doc-spec-card');
    recordTest('"INSPECTION DOCUMENT SPEC" card completely removed per user request', docSpecCard === null);

    const downloadBtn = await page.$('.download-btn');
    recordTest('"Download PDF" button exists and is active', downloadBtn !== null);

    // Verify Full-Width Desktop Layout
    const containerWidth = await page.$eval('.main-container', el => el.getBoundingClientRect().width);
    recordTest('Desktop main container covers wide full-width layout (width > 1000px)', containerWidth > 1000, `Width: ${containerWidth.toFixed(0)}px`);

    const splitGrid = await page.$('.desktop-grid-split');
    recordTest('Two-column split grid exists for Points and Extraordinary', splitGrid !== null);

    // 10. TEST SUBMIT TO RECORDS.JSON & TEAM LEAD REVIEW ROUTE (/review)
    console.log('📑 Testing Submit to records.json & Team Lead Review Workspace (/review)...');

    // Employee clicks "Submit Sheet"
    const submitBtn = await page.$('.submit-btn');
    recordTest('"Submit Sheet" button exists in action row', submitBtn !== null);
    await submitBtn.click();
    await new Promise(r => setTimeout(r, 600));

    const submitToast = await page.$eval('.toast-title', el => el.textContent.trim()).catch(() => '');
    recordTest('Submit Sheet triggers success toast', submitToast.includes('Submitted') || submitToast.includes('Saved'), `Toast: "${submitToast}"`);

    // Navigate to Team Lead Review tab
    const reviewTabBtn = await page.$('.review-nav-tab');
    recordTest('Team Lead Review tab exists in top navigation', reviewTabBtn !== null);
    await reviewTabBtn.click();
    await page.waitForSelector('.review-workspace-card', { visible: true, timeout: 5000 });
    await new Promise(r => setTimeout(r, 500));

    const reviewTitle = await page.$eval('.review-workspace-card .card-title', el => el.textContent.trim());
    recordTest('Team Lead Review Workspace opened at /review', reviewTitle.includes('Team Lead Review Workspace'));

    const statCards = await page.$$('.stat-card');
    recordTest('Summary stats cards rendered (Total, Pending, Reviewed)', statCards.length === 3);

    const recordsTable = await page.$('.records-table');
    recordTest('Master records table rendered with submitted employee records', recordsTable !== null);

    // Save screenshot of Review Workspace
    const ssReviewWsPath = path.join(ARTIFACTS_DIR, 'e2e_screenshot_review_workspace.png');
    await page.screenshot({ path: ssReviewWsPath, fullPage: true });
    recordTest('Review workspace screenshot saved', fs.existsSync(ssReviewWsPath));

    // Open first record for review
    const firstReviewBtn = await page.$('.review-action-btn');
    recordTest('"Review / Rate" action button exists in table row', firstReviewBtn !== null);
    await firstReviewBtn.click();
    await page.waitForSelector('.review-drawer-dialog', { visible: true, timeout: 5000 });
    await new Promise(r => setTimeout(r, 400));

    const drawerTitle = await page.$eval('.drawer-title', el => el.textContent.trim());
    recordTest('Review drawer opened for employee', drawerTitle.includes('Reviewing:'));

    // Select Score Pill 9
    const scorePills = await page.$$('.score-pill');
    recordTest('Rating score pills (1-10) rendered in review drawer', scorePills.length === 10);
    await scorePills[8].click(); // Score 9
    await new Promise(r => setTimeout(r, 200));

    // Enter Lead Review Comments
    await page.focus('#leadComments');
    await page.$eval('#leadComments', el => el.value = '');
    await page.type('#leadComments', 'Superb delivery and exceptional performance across all sprint deliverables.');
    await new Promise(r => setTimeout(r, 200));

    // Save screenshot of Review Drawer with rating & comments
    const ssReviewDrawerPath = path.join(ARTIFACTS_DIR, 'e2e_screenshot_review_drawer.png');
    await page.screenshot({ path: ssReviewDrawerPath, fullPage: false });
    recordTest('Review drawer dialog screenshot saved', fs.existsSync(ssReviewDrawerPath));

    // Click "Save Review to JSON"
    const saveReviewBtn = await page.$('.save-review-btn');
    recordTest('"Save Review to JSON" button exists', saveReviewBtn !== null);
    await saveReviewBtn.click();
    await new Promise(r => setTimeout(r, 600));

    const saveToast = await page.$eval('.toast-title', el => el.textContent.trim()).catch(() => '');
    recordTest('Saving review triggers "Review Saved to JSON!" toast', saveToast.includes('Saved'), `Toast: "${saveToast}"`);

    // Click "Preview PDF" from review drawer
    const previewReviewedBtn = await page.$('.preview-record-btn');
    await previewReviewedBtn.click();
    await page.waitForSelector('.modal-backdrop', { visible: true, timeout: 8000 });
    await page.waitForSelector('.sheet-paper', { visible: true, timeout: 8000 });
    await new Promise(r => setTimeout(r, 600));

    const reviewedSheetRatingVal = await page.$eval('.sheet-rating-val', el => el.textContent.trim()).catch(() => '');
    recordTest('Modal sheet preview displays assigned rating "9" inside rating box', reviewedSheetRatingVal === '9', `Rating: "${reviewedSheetRatingVal}"`);

    // Screenshot of Reviewed PDF Preview
    const ssReviewedPreviewPath = path.join(ARTIFACTS_DIR, 'e2e_screenshot_review_pdf_preview.png');
    await page.screenshot({ path: ssReviewedPreviewPath, fullPage: false });
    recordTest('Reviewed PDF preview screenshot saved', fs.existsSync(ssReviewedPreviewPath));

    // Close preview modal
    await page.$eval('.modal-close-btn', el => el.click());
    await new Promise(r => setTimeout(r, 400));

    // Close drawer
    await page.$eval('.drawer-close-btn', el => el.click());
    await new Promise(r => setTimeout(r, 400));

    // Switch back to Generator tab
    const generatorTabBtn = await page.$('.nav-tab-btn:first-child');
    await generatorTabBtn.click();
    await page.waitForSelector('.mpi-card .card-title', { visible: true, timeout: 5000 });
    await new Promise(r => setTimeout(r, 300));

    // 10. Test Mobile / Android Viewport (412x915) on dedicated mobile session
    console.log('📱 Testing Mobile & Android Responsiveness (412x915)...');
    const mobilePage = await browser.newPage();
    await mobilePage.setViewport({ width: 412, height: 915, isMobile: true, hasTouch: true });
    await mobilePage.goto(APP_URL, { waitUntil: 'networkidle0', timeout: 15000 });

    const buttonRowFlexDir = await mobilePage.$eval('.button-row', el => window.getComputedStyle(el).flexDirection);
    recordTest('Mobile button row stacks vertically (flex-direction: column)', buttonRowFlexDir === 'column', `Direction: "${buttonRowFlexDir}"`);

    const mobileDefaultAppBtn = await mobilePage.$('.default-app-btn');
    recordTest('Mobile "Default App" button removed from mobile view', mobileDefaultAppBtn === null);

    const mobileDownloadBtn = await mobilePage.$('.download-btn');
    recordTest('Mobile "Download PDF" accessible on Android screen', mobileDownloadBtn !== null);

    const mobileSendBtn = await mobilePage.$('.send-btn');
    recordTest('Mobile Send/Share button removed from mobile view', mobileSendBtn === null);

    const mobileEmpPlaceholder = await mobilePage.$eval('#employeeName', el => el.placeholder);
    recordTest('Mobile Employee Name placeholder is "Your Name"', mobileEmpPlaceholder === 'Your Name');

    // Verify editable month/year on mobile
    const mobileMonthYearVal = await mobilePage.$eval('#monthYear', el => el.value);
    recordTest('Mobile Month & Year input exists and is populated', mobileMonthYearVal.length > 3);

    // Fill and preview on mobile with custom month
    await mobilePage.focus('#employeeName');
    await mobilePage.type('#employeeName', 'Alex Mobile');

    await mobilePage.$eval('#monthYear', (el, text) => {
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, 'DECEMBER 2026');

    await mobilePage.$eval('#points', (el, text) => {
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, '1. Mobile responsive verification task 1.\n2. Mobile responsive verification task 2.');

    const mobilePreviewBtn = await mobilePage.$('.preview-btn');
    await mobilePreviewBtn.click();
    await mobilePage.waitForSelector('.modal-backdrop', { visible: true, timeout: 8000 });
    await mobilePage.waitForSelector('.preview-modal-dialog', { visible: true, timeout: 8000 });
    await mobilePage.waitForSelector('.sheet-paper', { visible: true, timeout: 8000 });
    await new Promise(r => setTimeout(r, 600));

    const mobileModal = await mobilePage.$('.modal-backdrop');
    recordTest('Mobile preview opens in dedicated responsive Modal Popup', mobileModal !== null);

    const mobileSheetContainer = await mobilePage.$('.sheet-scroll-container');
    recordTest('Mobile Sheet Scroll Container rendered properly inside modal', mobileSheetContainer !== null);

    const mobileSheetEmpName = await mobilePage.$eval('.sheet-emp-name', el => el.textContent.trim());
    recordTest('Mobile Sheet Header displays "Alex Mobile"', mobileSheetEmpName === 'Alex Mobile');

    const mobileSheetDate = await mobilePage.$eval('.sheet-date', el => el.textContent.trim());
    recordTest('Mobile Sheet Header displays edited date "DECEMBER 2026"', mobileSheetDate === 'DECEMBER 2026');

    // Verify Mobile Modal Dialog Full Screen & Single Row Header
    const mobileDialogRect = await mobilePage.$eval('.preview-modal-dialog', el => {
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    });
    recordTest('Mobile modal dialog covers full screen (width >= 400px, height >= 850px)', mobileDialogRect.width >= 400 && mobileDialogRect.height >= 850, `W: ${mobileDialogRect.width}px, H: ${mobileDialogRect.height}px`);

    const mobileHeaderStyles = await mobilePage.$eval('.preview-modal-header', el => {
      const cs = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        flexWrap: cs.flexWrap,
        height: r.height
      };
    });
    recordTest('Mobile modal header is single-row compact bar (height <= 56px, nowrap)', mobileHeaderStyles.height <= 56 && mobileHeaderStyles.flexWrap === 'nowrap', `Height: ${mobileHeaderStyles.height}px, flexWrap: ${mobileHeaderStyles.flexWrap}`);

    const mobilePaperWidth = await mobilePage.$eval('.sheet-paper', el => el.getBoundingClientRect().width);
    recordTest('Mobile A4 sheet paper expands to fill screen width (>= 370px)', mobilePaperWidth >= 370, `Width: ${mobilePaperWidth.toFixed(1)}px`);

    const ssMobilePath = path.join(ARTIFACTS_DIR, 'e2e_screenshot_mobile_preview_modal.png');
    await mobilePage.screenshot({ path: ssMobilePath, fullPage: false });

    const ssMobileDesignPath = path.join(ARTIFACTS_DIR, 'e2e_screenshot_mobile_design.png');
    fs.copyFileSync(ssMobilePath, ssMobileDesignPath);
    recordTest('Mobile modal preview screenshot saved', fs.existsSync(ssMobileDesignPath));

    // Close modal on mobile
    const mobileCloseBtn = await mobilePage.$('.modal-close-btn');
    await mobileCloseBtn.click();
    await new Promise(r => setTimeout(r, 400));

    const mobileModalAfterClose = await mobilePage.$('.modal-backdrop');
    recordTest('Mobile Modal closes cleanly via close button', mobileModalAfterClose === null);

    const ssMobileCleanPath = path.join(ARTIFACTS_DIR, 'e2e_screenshot_mobile_clean_screen.png');
    await mobilePage.screenshot({ path: ssMobileCleanPath, fullPage: true });

    await mobilePage.close();

  } catch (error) {
    console.error('❌ E2E Test execution error:', error);
    recordTest('Test execution completed without uncaught exceptions', false, error.message);
  } finally {
    if (browser) await browser.close();
    server.close();
    console.log('🛑 In-Process Static Server closed.');
  }

  console.log('\n=======================================');
  console.log('E2E Test Results:');
  const total = testResults.length;
  const passed = testResults.filter(r => r.passed).length;
  console.log(`Passed: ${passed}/${total}`);
  console.log('=======================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runE2ETests();
