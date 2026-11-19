import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { MPISheetRequest } from '../models/mpi.models';
import { MpiPdfGeneratorService } from './mpi-pdf-generator.service';

@Injectable({
  providedIn: 'root'
})
export class MpiService {
  private readonly pdfGenerator = inject(MpiPdfGeneratorService);

  /**
   * Generates client-side MPI PDF and returns a Blob for instant in-browser preview
   */
  previewPdf(request: MPISheetRequest): Observable<Blob> {
    return from(this.pdfGenerator.generatePdfBlob(request));
  }
}

