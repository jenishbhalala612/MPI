import { TestBed } from '@angular/core/testing';
import { MpiPdfGeneratorService } from './mpi-pdf-generator.service';
import { MPISheetRequest } from '../models/mpi.models';
import { PDFDocument } from 'pdf-lib';

describe('MpiPdfGeneratorService', () => {
  let service: MpiPdfGeneratorService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MpiPdfGeneratorService]
    });
    service = TestBed.inject(MpiPdfGeneratorService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should generate a 1-page PDF when points fit within Page 1 completely', async () => {
    const req: MPISheetRequest = {
      employeeName: 'Alice Developer',
      date: '2026-11-01',
      points: [
        'Task 1: Implemented feature A',
        'Task 2: Implemented feature B',
        'Task 3: Fixed bug C'
      ].join('\n')
    };

    const bytes = await service.generatePdfBytes(req);
    expect(bytes).toBeDefined();
    expect(bytes.length).toBeGreaterThan(1000);

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('should fill Page 1 completely before generating Page 2 for large points list', async () => {
    const pointsList: string[] = [];
    for (let i = 1; i <= 60; i++) {
      pointsList.push(`Point ${i}: Created a deployment SQL script to update the Label for question ID: ${3200 + i}`);
    }

    const req: MPISheetRequest = {
      employeeName: 'Bob Engineer',
      date: '2026-11-01',
      points: pointsList.join('\n')
    };

    const bytes = await service.generatePdfBytes(req);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
  });

  it('should strictly limit the document to a maximum of 2 pages even with 150 points', async () => {
    const pointsList: string[] = [];
    for (let i = 1; i <= 150; i++) {
      pointsList.push(`Overflow point ${i}: High volume task execution item testing strict 2 page limit enforcement.`);
    }

    const req: MPISheetRequest = {
      employeeName: 'Dana Tester',
      date: '2026-11-01',
      points: pointsList.join('\n')
    };

    const bytes = await service.generatePdfBytes(req);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
  });

  it('should generate Blob correctly', async () => {
    const req: MPISheetRequest = {
      employeeName: 'Charlie',
      points: '1. First point\n2. Second point'
    };

    const blob = await service.generatePdfBlob(req);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(1000);
  });
});
