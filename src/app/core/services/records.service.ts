import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { RecordsDatabase, SheetRecord } from '../models/mpi.models';

const STORAGE_KEY = 'mpi_records_cache';

@Injectable({
  providedIn: 'root'
})
export class RecordsService {
  private readonly http = inject(HttpClient);

  // Reactive state of all loaded records
  readonly records = signal<RecordsDatabase>({});
  readonly isLoading = signal<boolean>(false);
  readonly lastError = signal<string | null>(null);

  constructor() {
    this.initFromLocalCache();
    this.refreshRecords().subscribe();
  }

  private initFromLocalCache(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && typeof parsed === 'object') {
            this.records.set(parsed);
          }
        }
      } catch (e) {
        console.warn('Failed to parse local records cache:', e);
      }
    }
  }

  private saveToLocalCache(data: RecordsDatabase): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (e) {
        console.warn('Failed to write to local records cache:', e);
      }
    }
  }

  /**
   * Refreshes records from Netlify Functions direct endpoint or /api/records or fallback static /records.json
   */
  refreshRecords(): Observable<RecordsDatabase> {
    this.isLoading.set(true);
    this.lastError.set(null);

    // If running in test / non-browser environment without origin, avoid invalid relative URL
    if (typeof window === 'undefined' || !window.location || !window.location.origin || window.location.origin === 'null') {
      this.isLoading.set(false);
      return of(this.records());
    }

    const fnUrl = `${window.location.origin}/.netlify/functions/records`;
    const apiUrl = `${window.location.origin}/api/records`;
    const jsonUrl = `${window.location.origin}/records.json`;

    // Try Netlify direct function first, then /api/records, then static records.json
    return this.http.get<{ success?: boolean; data?: RecordsDatabase }>(fnUrl).pipe(
      map(res => (res && res.data) ? res.data : (res as unknown as RecordsDatabase)),
      catchError(() => {
        return this.http.get<{ success?: boolean; data?: RecordsDatabase }>(apiUrl).pipe(
          map(res => (res && res.data) ? res.data : (res as unknown as RecordsDatabase)),
          catchError(() => {
            return this.http.get<RecordsDatabase>(jsonUrl).pipe(
              catchError(() => of(this.records()))
            );
          })
        );
      }),
      tap(loaded => {
        if (!loaded || typeof loaded !== 'object') {
          this.isLoading.set(false);
          return;
        }

        // SMART MERGE: Local state takes precedence if it has a newer or equal updatedAt timestamp!
        const currentDb = { ...this.records() };

        for (const emp of Object.keys(loaded)) {
          if (!currentDb[emp]) {
            currentDb[emp] = {};
          }
          for (const mYear of Object.keys(loaded[emp] || {})) {
            const incoming = loaded[emp][mYear];
            const existing = currentDb[emp][mYear];

            if (!existing) {
              currentDb[emp][mYear] = incoming;
            } else {
              const timeIncoming = incoming.updatedAt ? new Date(incoming.updatedAt).getTime() : 0;
              const timeExisting = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
              // Keep newer record
              if (timeIncoming > timeExisting) {
                currentDb[emp][mYear] = incoming;
              }
            }
          }
        }

        this.records.set(currentDb);
        this.saveToLocalCache(currentDb);
        this.isLoading.set(false);
      })
    );
  }

  /**
   * Saves or updates a record employee-wise and month/year-wise
   */
  saveRecord(record: SheetRecord): Observable<SheetRecord> {
    const employeeName = record.employeeName.trim();
    const monthYear = record.monthYear.trim().toUpperCase();

    const current = { ...this.records() };
    if (!current[employeeName]) {
      current[employeeName] = {};
    }

    const updatedRecord: SheetRecord = {
      ...record,
      employeeName,
      monthYear,
      status: record.status || 'Pending',
      updatedAt: new Date().toISOString()
    };

    current[employeeName][monthYear] = updatedRecord;
    this.records.set(current);
    this.saveToLocalCache(current);

    if (typeof window === 'undefined' || !window.location || !window.location.origin || window.location.origin === 'null') {
      return of(updatedRecord);
    }

    const fnUrl = `${window.location.origin}/.netlify/functions/records`;
    const apiUrl = `${window.location.origin}/api/records`;

    return this.http.post<{ success?: boolean; data?: SheetRecord }>(fnUrl, updatedRecord).pipe(
      map(res => (res && res.data) ? res.data : updatedRecord),
      catchError(() => {
        return this.http.post<{ success?: boolean; data?: SheetRecord }>(apiUrl, updatedRecord).pipe(
          map(res => (res && res.data) ? res.data : updatedRecord),
          catchError(() => of(updatedRecord))
        );
      })
    );
  }

  /**
   * Get a specific record by employee and month
   */
  getRecord(employeeName: string, monthYear: string): SheetRecord | null {
    const db = this.records();
    const emp = db[employeeName.trim()];
    if (!emp) return null;
    return emp[monthYear.trim().toUpperCase()] || null;
  }

  /**
   * Convert nested database into flat array for table/card view
   */
  getAllRecordsFlat(): SheetRecord[] {
    const db = this.records();
    const list: SheetRecord[] = [];

    for (const empName of Object.keys(db)) {
      const months = db[empName];
      for (const mYear of Object.keys(months)) {
        list.push(months[mYear]);
      }
    }

    return list.sort((a, b) => {
      const tA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return tB - tA;
    });
  }
}
