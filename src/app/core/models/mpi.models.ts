export interface MPISheetRequest {
  fromEmail?: string;
  toEmail?: string;
  subject?: string;
  projectName?: string;
  employeeName?: string;
  seniorName?: string;
  date?: string;
  seniorReview?: string;
  seniorRating?: number | string | null;
  hrReview?: string;
  hrRating?: number | string | null;
  extraCurricularActivity?: string;
  employeeId?: string;
  points: string;
}

export interface SheetRecord {
  employeeName: string;
  monthYear: string;
  points: string;
  extraCurricularActivity?: string;
  teamLeadReview?: string;
  teamLeadRating?: number | null;
  hrReview?: string;
  hrRating?: number | null;
  status: 'Pending' | 'Reviewed';
  updatedAt?: string;
}

export interface RecordsDatabase {
  [employeeName: string]: {
    [monthYear: string]: SheetRecord;
  };
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  timestamp: Date;
}

