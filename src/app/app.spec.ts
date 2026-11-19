import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient()
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render MPI Sheet Generator title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.card-title')?.textContent).toContain('MPI Sheet Generator');
  });

  it('should initialize with empty form fields and default month/year', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app.employeeName()).toBe('');
    expect(app.points()).toBe('');
    expect(app.pointsCount()).toBe(0);
    expect(app.monthYear()).toBe(app.getDefaultMonthYear());
    expect(app.subject()).toBe(app.getComputedSubject());
    expect(app.subject()).toContain('MPI');
  });

  it('should dynamically update subject and monthYear when edited', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    app.onEmployeeNameChange('Jenish');
    expect(app.subject()).toBe(`MPI Jenish ${app.getDefaultMonthYear()}`);

    app.onMonthYearChange('OCTOBER 2026');
    expect(app.monthYear()).toBe('OCTOBER 2026');
    expect(app.subject()).toBe('MPI Jenish OCTOBER 2026');

    app.onEmployeeNameChange('Alex');
    expect(app.subject()).toBe('MPI Alex OCTOBER 2026');
  });

  it('should calculate the last date of the entered month correctly', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    // Test with November 2026 (last day: 30)
    app.date.set('2026-11-06');
    expect(app.lastDateOfMonthDisplay()).toBe('30 NOVEMBER 2026');

    // Test with February 2024 (leap year, last day: 29)
    app.date.set('2024-02-10');
    expect(app.lastDateOfMonthDisplay()).toBe('29 FEBRUARY 2024');

    // Test with February 2025 (non-leap year, last day: 28)
    app.date.set('2025-02-05');
    expect(app.lastDateOfMonthDisplay()).toBe('28 FEBRUARY 2025');
  });

  it('should clear form fields and reset subject on clearForm()', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.employeeName.set('Jenish');
    app.points.set('1. Task one');
    app.extraCurricularActivity.set('Workshop');

    app.clearForm();

    expect(app.employeeName()).toBe('');
    expect(app.seniorReview()).toBe('');
    expect(app.hrReview()).toBe('');
    expect(app.extraCurricularActivity()).toBe('');
    expect(app.points()).toBe('');
    expect(app.subject()).toBe(app.getComputedSubject());
  });

  it('should render only Preview and Download buttons in button row', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.preview-btn')).not.toBeNull();
    expect(compiled.querySelector('.download-btn')).not.toBeNull();
    expect(compiled.querySelector('.default-app-btn')).toBeNull();
    expect(compiled.querySelector('.send-btn')).toBeNull();
    expect(compiled.querySelector('.share-btn')).toBeNull();
  });

  it('should control preview modal visibility with isPreviewModalOpen signal', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    await fixture.whenStable();

    expect(app.isPreviewModalOpen()).toBe(false);
    expect(fixture.nativeElement.querySelector('.modal-backdrop')).toBeNull();

    app.isPreviewModalOpen.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.modal-backdrop')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.preview-modal-dialog')).not.toBeNull();

    app.closePreviewModal();
    fixture.detectChanges();
    expect(app.isPreviewModalOpen()).toBe(false);
    expect(fixture.nativeElement.querySelector('.modal-backdrop')).toBeNull();
  });

  it('should render frontend inputs and omit Team Lead review and HR review sections', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    // Obsolete inputs and removed review sections must not exist in template
    expect(compiled.querySelector('#projectName')).toBeNull();
    expect(compiled.querySelector('#seniorName')).toBeNull();
    expect(compiled.querySelector('#seniorReview')).toBeNull();
    expect(compiled.querySelector('#hrReview')).toBeNull();

    // Required inputs for new sheet structure must exist
    expect(compiled.querySelector('#employeeName')).not.toBeNull();
    expect(compiled.querySelector('#monthYear')).not.toBeNull();
    expect(compiled.querySelector('#points')).not.toBeNull();
    expect(compiled.querySelector('#extraCurricularActivity')).not.toBeNull();
    // Email inputs removed from UI per user request
    expect(compiled.querySelector('#fromEmail')).toBeNull();
    expect(compiled.querySelector('#toEmail')).toBeNull();
  });
});
