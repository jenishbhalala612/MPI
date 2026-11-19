import { Component, HostListener, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MpiService } from './core/services/mpi.service';
import { RecordsService } from './core/services/records.service';
import { MPISheetRequest, SheetRecord, ToastMessage } from './core/models/mpi.models';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnDestroy {
  private readonly mpiService = inject(MpiService);
  private readonly recordsService = inject(RecordsService);
  private readonly sanitizer = inject(DomSanitizer);

  // Active View Tab: 'generator' (/) or 'review' (/review)
  readonly activeTab = signal<'generator' | 'review'>('generator');

  // Form Fields matching MPISheetRequest
  readonly fromEmail = signal<string>('');
  readonly toEmail = signal<string>('');
  readonly projectName = signal<string>('');
  readonly employeeName = signal<string>('');
  readonly seniorName = signal<string>('');
  readonly monthYear = signal<string>(this.getDefaultMonthYear());
  readonly date = signal<string>(this.getInitialDate());
  readonly seniorReview = signal<string>('');
  readonly seniorRating = signal<number | null>(null);
  readonly hrReview = signal<string>('');
  readonly hrRating = signal<number | null>(null);
  readonly extraCurricularActivity = signal<string>('');
  readonly points = signal<string>('');

  // Subject auto-generated based on Employee Name and Month/Year
  readonly isSubjectCustomized = signal<boolean>(false);
  readonly subject = signal<string>('');

  // Loading States
  readonly isLoadingPreview = signal<boolean>(false);
  readonly isSubmitting = signal<boolean>(false);
  readonly isSavingReview = signal<boolean>(false);

  // PDF Preview State
  readonly isPreviewModalOpen = signal<boolean>(false);
  readonly previewMode = signal<'sheet' | 'pdf'>('pdf');
  readonly pdfBlob = signal<Blob | null>(null);
  readonly pdfRawUrl = signal<string | null>(null);
  readonly pdfSafeUrl = signal<SafeResourceUrl | null>(null);
  readonly pdfDataUrl = signal<SafeResourceUrl | null>(null);
  readonly pdfFileSize = signal<string>('');
  readonly pdfGeneratedAt = signal<Date | null>(null);

  // Toast Notifications
  readonly toasts = signal<ToastMessage[]>([]);

  // --- Team Lead Review Workspace Signals ---
  readonly reviewSearchTerm = signal<string>('');
  readonly reviewMonthFilter = signal<string>('ALL');
  readonly reviewStatusFilter = signal<'ALL' | 'Pending' | 'Reviewed'>('ALL');
  readonly selectedRecord = signal<SheetRecord | null>(null);

  // Editing state inside Team Lead review drawer
  readonly reviewEditingLeadComments = signal<string>('');
  readonly reviewEditingLeadRating = signal<number | null>(null);
  readonly reviewEditingHrComments = signal<string>('');
  readonly reviewEditingHrRating = signal<number | null>(null);
  readonly reviewEditingStatus = signal<'Pending' | 'Reviewed'>('Reviewed');

  // --- TOTP Verification Signals ---
  readonly isReviewUnlocked = signal<boolean>(false);
  readonly totpCode = signal<string>('');
  readonly isVerifyingTotp = signal<boolean>(false);
  readonly totpErrorMessage = signal<string | null>(null);
  readonly showTotpSetupGuide = signal<boolean>(false);
  readonly totpSecretKey = 'MPSR2236TLREVKEY';

  constructor() {
    this.subject.set(this.getComputedSubject());

    // Check initial URL route (/review or #/review)
    if (typeof window !== 'undefined') {
      const checkRoute = () => {
        const p = (window.location.pathname || '').toLowerCase();
        const h = (window.location.hash || '').toLowerCase();
        if (p.startsWith('/review') || h.includes('review')) {
          this.activeTab.set('review');
        } else {
          this.activeTab.set('generator');
          this.isReviewUnlocked.set(false);
          this.totpCode.set('');
          this.totpErrorMessage.set(null);
        }
      };

      checkRoute();
      window.addEventListener('popstate', checkRoute);
      window.addEventListener('hashchange', checkRoute);
    }

    // Lock body scrolling when modal is open to ensure pure mobile viewport coverage
    effect(() => {
      if (typeof document !== 'undefined') {
        if (this.isPreviewModalOpen()) {
          document.body.classList.add('modal-open');
        } else {
          document.body.classList.remove('modal-open');
        }
      }
    });
  }

  // --- Computed Values for Generator ---
  readonly pointsCount = computed(() => {
    const text = this.points().trim();
    if (!text) return 0;
    return text.split(/\r?\n/).filter(line => line.trim().length > 0).length;
  });

  readonly pointsPageInfo = computed(() => {
    const raw = this.points().trim();
    if (!raw) {
      return { count: 0, estimatedPages: 0, isFull: false, label: '', badgeClass: '' };
    }

    const lines = raw.split(/\r?\n/).map(p => p.trim()).filter(p => p.length > 0);
    const count = lines.length;

    // Line capacity model based on 527pt box width (~105 chars per line):
    // Page 1 has 522pt usable height (~45 lines)
    // Page 2 has 735pt usable height (~64 lines)
    // Total 2 pages = ~109 lines
    let totalLines = 0;
    for (const pt of lines) {
      const clean = pt.replace(/^(\d+[\.\)\-:]|\*|\-|•|▪|–)\s*/, '').trim();
      const ptLines = Math.max(1, Math.ceil(clean.length / 105));
      totalLines += ptLines;
    }

    const effectiveLines = totalLines + (count * 0.3); // account for 3.5pt gap between points

    if (effectiveLines <= 45) {
      return {
        count,
        estimatedPages: 1,
        isFull: false,
        label: `${count} ${count === 1 ? 'point' : 'points'} • Page 1`,
        badgeClass: 'page1'
      };
    } else if (effectiveLines <= 109) {
      return {
        count,
        estimatedPages: 2,
        isFull: false,
        label: `${count} points • Page 2`,
        badgeClass: 'page2'
      };
    } else {
      return {
        count,
        estimatedPages: 2,
        isFull: true,
        label: `${count} points • ⚠️ 2 Pages Full (Max Limit)`,
        badgeClass: 'full'
      };
    }
  });

  readonly pointsList = computed(() => {
    const raw = this.points().trim();
    if (!raw) return [];
    return raw.split(/\r?\n/).map(p => p.trim()).filter(p => p.length > 0);
  });

  readonly currentMonthYearDisplay = computed(() => {
    return this.monthYear().trim() || this.getDefaultMonthYear();
  });

  readonly targetFilename = computed(() => {
    const name = (this.employeeName().trim() || 'Sheet').replace(/[^a-zA-Z0-9_-]/g, '_');
    const period = this.currentMonthYearDisplay().replace(/\s+/g, '_');
    return `MPI_${name}_${period}.pdf`;
  });

  // --- Computed Values for Team Lead Review Workspace ---
  readonly recordsList = computed(() => {
    return this.recordsService.getAllRecordsFlat();
  });

  readonly availableMonths = computed(() => {
    const list = this.recordsList();
    const set = new Set<string>();
    for (const r of list) {
      if (r.monthYear) set.add(r.monthYear);
    }
    return Array.from(set);
  });

  readonly pendingReviewCount = computed(() => {
    return this.recordsList().filter(r => r.status === 'Pending').length;
  });

  readonly reviewedCount = computed(() => {
    return this.recordsList().filter(r => r.status === 'Reviewed').length;
  });

  readonly filteredRecords = computed(() => {
    const all = this.recordsList();
    const search = this.reviewSearchTerm().trim().toLowerCase();
    const month = this.reviewMonthFilter();
    const status = this.reviewStatusFilter();

    return all.filter(r => {
      const matchSearch = !search || r.employeeName.toLowerCase().includes(search) || r.points.toLowerCase().includes(search);
      const matchMonth = month === 'ALL' || r.monthYear === month;
      const matchStatus = status === 'ALL' || r.status === status;
      return matchSearch && matchMonth && matchStatus;
    });
  });

  // --- Navigation Switcher ---
  setTab(tab: 'generator' | 'review'): void {
    this.activeTab.set(tab);
    if (tab === 'generator') {
      this.isReviewUnlocked.set(false);
      this.totpCode.set('');
      this.totpErrorMessage.set(null);
    }
    if (typeof window !== 'undefined' && window.history) {
      const targetUrl = tab === 'review' ? '/review' : '/';
      if (window.location.pathname !== targetUrl) {
        window.history.pushState(null, '', targetUrl);
      }
    }
    if (tab === 'review' && this.isReviewUnlocked()) {
      this.recordsService.refreshRecords().subscribe();
    }
  }

  getDefaultMonthYear(): string {
    const now = new Date();
    const monthNames = [
      'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
      'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
    ];
    return `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
  }

  onMonthYearChange(val: string): void {
    this.monthYear.set(val);
    if (!this.isSubjectCustomized()) {
      this.subject.set(this.getComputedSubject());
    }
  }

  readonly lastDateOfMonthDisplay = computed(() => {
    const raw = this.date();
    if (!raw) return '';
    try {
      const parts = raw.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const lastDay = new Date(year, month, 0).getDate();
        const monthNames = [
          'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
          'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
        ];
        const dayStr = String(lastDay).padStart(2, '0');
        return `${dayStr} ${monthNames[month - 1]} ${year}`;
      }
    } catch {}
    return '';
  });

  readonly isFormValid = computed(() => {
    return this.isValidEmail(this.fromEmail()) &&
           this.isValidEmail(this.toEmail()) &&
           this.points().trim().length > 0;
  });

  ngOnDestroy(): void {
    if (typeof document !== 'undefined') {
      document.body.classList.remove('modal-open');
    }
    this.cleanUpPdfUrl();
  }

  getComputedSubject(): string {
    const name = this.employeeName ? this.employeeName().trim() : '';
    const month = this.currentMonthYearDisplay();
    return name ? `MPI ${name} ${month}` : `MPI ${month}`;
  }

  onEmployeeNameChange(name: string): void {
    this.employeeName.set(name);
    if (!this.isSubjectCustomized()) {
      this.subject.set(this.getComputedSubject());
    }
  }

  onSubjectChange(val: string): void {
    this.subject.set(val);
    const computed = this.getComputedSubject();
    this.isSubjectCustomized.set(val.trim().length > 0 && val.trim() !== computed);
  }

  @HostListener('window:keydown.escape')
  handleEscapeKey(): void {
    if (this.isPreviewModalOpen()) {
      this.closePreviewModal();
    }
  }

  // --- Generator Action: Submit Sheet to records.json ---
  onSubmitSheetForReview(): void {
    const empName = this.employeeName().trim();
    const pts = this.points().trim();

    if (!empName) {
      this.addToast('error', 'Validation Error', 'Please enter your Employee Name before submitting.');
      return;
    }
    if (!pts) {
      this.addToast('error', 'Validation Error', 'MPI Sheet Points cannot be empty.');
      return;
    }

    this.isSubmitting.set(true);

    const record: SheetRecord = {
      employeeName: empName,
      monthYear: this.currentMonthYearDisplay(),
      points: pts,
      extraCurricularActivity: this.extraCurricularActivity().trim(),
      teamLeadReview: this.seniorReview().trim(),
      teamLeadRating: this.seniorRating(),
      hrReview: this.hrReview().trim(),
      hrRating: this.hrRating(),
      status: 'Pending',
      updatedAt: new Date().toISOString()
    };

    this.recordsService.saveRecord(record).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.resetFormFields();
        this.addToast(
          'success',
          'Sheet Submitted to Records!',
          `Saved into records.json for ${empName} (${record.monthYear}) with status Pending Review.`
        );
      },
      error: (err: Error) => {
        this.isSubmitting.set(false);
        this.addToast('error', 'Submission Failed', err.message);
      }
    });
  }

  // --- Team Lead Review Actions ---
  selectRecordForReview(record: SheetRecord): void {
    this.selectedRecord.set(record);
    this.reviewEditingLeadComments.set(record.teamLeadReview || '');
    this.reviewEditingLeadRating.set(record.teamLeadRating ?? null);
    this.reviewEditingHrComments.set(record.hrReview || '');
    this.reviewEditingHrRating.set(record.hrRating ?? null);
    this.reviewEditingStatus.set('Reviewed');
  }

  closeRecordReview(): void {
    this.selectedRecord.set(null);
  }

  setLeadRating(rating: number): void {
    this.reviewEditingLeadRating.set(rating);
  }

  saveTeamLeadReview(): void {
    const current = this.selectedRecord();
    if (!current) return;

    this.isSavingReview.set(true);

    const updatedRecord: SheetRecord = {
      ...current,
      teamLeadReview: this.reviewEditingLeadComments().trim(),
      teamLeadRating: this.reviewEditingLeadRating(),
      hrReview: this.reviewEditingHrComments().trim(),
      hrRating: this.reviewEditingHrRating(),
      status: 'Reviewed',
      updatedAt: new Date().toISOString()
    };

    this.recordsService.saveRecord(updatedRecord).subscribe({
      next: (saved) => {
        this.isSavingReview.set(false);
        this.closeRecordReview();
        this.addToast(
          'success',
          'Review Saved to JSON!',
          `Updated records.json for ${saved.employeeName} (${saved.monthYear}) with rating ${saved.teamLeadRating ?? '-'}/10.`
        );
      },
      error: (err: Error) => {
        this.isSavingReview.set(false);
        this.addToast('error', 'Save Failed', err.message);
      }
    });
  }

  // --- TOTP Authentication Actions ---
  onVerifyTotp(): void {
    const code = this.totpCode().trim().replace(/\D/g, '');
    if (code.length !== 6) {
      this.totpErrorMessage.set('Please enter the full 6-digit code from your authenticator app.');
      return;
    }

    this.isVerifyingTotp.set(true);
    this.totpErrorMessage.set(null);

    this.recordsService.verifyTotp(code).subscribe({
      next: (res) => {
        this.isVerifyingTotp.set(false);
        if (res.success) {
          this.isReviewUnlocked.set(true);
          if (typeof window !== 'undefined' && window.sessionStorage) {
            window.sessionStorage.setItem('mpi_review_unlocked', 'true');
          }
          this.totpCode.set('');
          this.addToast('success', 'Access Granted', 'Team Lead Workspace Unlocked.');
          this.recordsService.refreshRecords().subscribe();
        } else {
          this.totpErrorMessage.set(res.error || 'Invalid 6-digit code. Please verify against your Authenticator app.');
          this.addToast('error', 'Authentication Failed', this.totpErrorMessage()!);
        }
      },
      error: (err: Error) => {
        this.isVerifyingTotp.set(false);
        this.totpErrorMessage.set(err.message || 'Verification failed. Please try again.');
      }
    });
  }

  lockReviewWorkspace(): void {
    this.isReviewUnlocked.set(false);
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem('mpi_review_unlocked');
    }
    this.totpCode.set('');
    this.totpErrorMessage.set(null);
    this.addToast('info', 'Workspace Locked', 'Team Lead Review Workspace has been secured.');
  }

  toggleTotpSetupGuide(): void {
    this.showTotpSetupGuide.update(v => !v);
  }

  copyTotpSecret(): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(this.totpSecretKey).then(() => {
        this.addToast('success', 'Copied!', 'Secret key copied to clipboard.');
      }).catch(() => {
        this.addToast('info', 'Secret Key', this.totpSecretKey);
      });
    } else {
      this.addToast('info', 'Secret Key', this.totpSecretKey);
    }
  }

  previewRecordPdf(record: SheetRecord): void {
    this.employeeName.set(record.employeeName);
    this.monthYear.set(record.monthYear);
    this.points.set(record.points);
    this.extraCurricularActivity.set(record.extraCurricularActivity || '');
    this.seniorReview.set(this.reviewEditingLeadComments() || record.teamLeadReview || '');
    this.seniorRating.set(this.reviewEditingLeadRating() ?? record.teamLeadRating ?? null);
    this.hrReview.set(this.reviewEditingHrComments() || record.hrReview || '');
    this.hrRating.set(this.reviewEditingHrRating() ?? record.hrRating ?? null);

    this.onPreviewPdf();
  }

  downloadRecordPdf(record: SheetRecord): void {
    this.employeeName.set(record.employeeName);
    this.monthYear.set(record.monthYear);
    this.points.set(record.points);
    this.extraCurricularActivity.set(record.extraCurricularActivity || '');
    this.seniorReview.set(this.reviewEditingLeadComments() || record.teamLeadReview || '');
    this.seniorRating.set(this.reviewEditingLeadRating() ?? record.teamLeadRating ?? null);
    this.hrReview.set(this.reviewEditingHrComments() || record.hrReview || '');
    this.hrRating.set(this.reviewEditingHrRating() ?? record.hrRating ?? null);

    this.onDownloadPdf();
  }

  refreshRecords(): void {
    this.recordsService.refreshRecords().subscribe({
      next: () => {
        this.addToast('info', 'Records Refreshed', 'Loaded latest employee sheets from records.json');
      }
    });
  }

  // --- Standard Actions ---
  onPreviewPdf(): void {
    if (!this.validatePreview()) {
      return;
    }

    this.isLoadingPreview.set(true);

    const request: MPISheetRequest = this.buildRequestPayload();

    this.mpiService.previewPdf(request).subscribe({
      next: (blob: Blob) => {
        this.isLoadingPreview.set(false);
        this.updatePdfPreview(blob);
        this.isPreviewModalOpen.set(true);
        this.addToast('success', 'Preview Ready', 'MPI Sheet preview opened.');
      },
      error: (err: Error) => {
        this.isLoadingPreview.set(false);
        this.addToast('error', 'Preview Failed', err.message);
      }
    });
  }

  closePreviewModal(): void {
    this.isPreviewModalOpen.set(false);
  }

  private buildRequestPayload(): MPISheetRequest {
    return {
      fromEmail: '',
      toEmail: '',
      subject: this.subject().trim() || this.getComputedSubject(),
      projectName: '',
      employeeName: this.employeeName().trim(),
      seniorName: '',
      date: this.monthYear().trim() || this.getDefaultMonthYear(),
      seniorReview: this.seniorReview().trim(),
      seniorRating: this.seniorRating(),
      hrReview: this.hrReview().trim(),
      hrRating: this.hrRating(),
      extraCurricularActivity: this.extraCurricularActivity().trim(),
      points: this.points().trim()
    };
  }

  onDownloadPdf(): void {
    const filename = this.targetFilename();
    const rawUrl = this.pdfRawUrl();

    if (rawUrl) {
      const link = document.createElement('a');
      link.href = rawUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.addToast('info', 'Download Started', `Downloading ${filename}`);
      return;
    }

    if (!this.validatePreview()) return;

    this.isLoadingPreview.set(true);
    const request = this.buildRequestPayload();
    this.mpiService.previewPdf(request).subscribe({
      next: (blob) => {
        this.updatePdfPreview(blob);
        this.isLoadingPreview.set(false);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.addToast('success', 'PDF Downloaded', `Generated and downloaded ${filename}`);
      },
      error: (err: Error) => {
        this.isLoadingPreview.set(false);
        this.addToast('error', 'Generation Failed', err.message);
      }
    });
  }

  resetFormFields(): void {
    this.employeeName.set('');
    this.monthYear.set(this.getDefaultMonthYear());
    this.extraCurricularActivity.set('');
    this.points.set('');
    this.seniorReview.set('');
    this.seniorRating.set(null);
    this.hrReview.set('');
    this.hrRating.set(null);
    this.isSubjectCustomized.set(false);
    this.subject.set(this.getComputedSubject());
    this.isPreviewModalOpen.set(false);
    this.cleanUpPdfUrl();
  }

  clearForm(): void {
    this.resetFormFields();
    this.addToast('info', 'Form Cleared', 'All input fields cleared.');
  }

  private updatePdfPreview(blob: Blob): void {
    this.cleanUpPdfUrl();

    this.pdfBlob.set(blob);
    const objectUrl = URL.createObjectURL(blob);
    this.pdfRawUrl.set(objectUrl);
    this.pdfSafeUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(objectUrl));
    this.pdfGeneratedAt.set(new Date());

    const kb = (blob.size / 1024).toFixed(1);
    this.pdfFileSize.set(`${kb} KB`);

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string) + '#toolbar=0&navpanes=0&scrollbar=1';
      this.pdfDataUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(base64Data));
    };
    reader.readAsDataURL(blob);
  }

  private cleanUpPdfUrl(): void {
    const currentUrl = this.pdfRawUrl();
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
      this.pdfRawUrl.set(null);
      this.pdfSafeUrl.set(null);
      this.pdfDataUrl.set(null);
      this.pdfBlob.set(null);
      this.pdfFileSize.set('');
    }
  }

  private validatePreview(): boolean {
    if (!this.points().trim()) {
      this.addToast('error', 'Validation Error', 'MPI Sheet Points cannot be empty.');
      return false;
    }
    return true;
  }

  isValidEmail(email: string): boolean {
    if (!email) return false;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email.trim());
  }

  addToast(type: 'success' | 'error' | 'info' | 'warning', title: string, message: string): void {
    const id = Math.random().toString(36).substring(2, 9);
    const toast: ToastMessage = {
      id,
      type,
      title,
      message,
      timestamp: new Date()
    };

    this.toasts.update(list => [toast, ...list].slice(0, 4));

    setTimeout(() => {
      this.removeToast(id);
    }, 4500);
  }

  removeToast(id: string): void {
    this.toasts.update(list => list.filter(t => t.id !== id));
  }

  cleanPointText(text: string): string {
    return (text || '').replace(/^(\d+[\.\)\-:]|\*|\-|•|▪|–)\s+/, '').trim();
  }

  private getInitialDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
