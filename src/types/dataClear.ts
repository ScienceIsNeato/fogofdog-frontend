export interface DataStats {
  totalPoints: number;
  recentPoints: number; // last 24 hours
  oldestDate: Date | null;
  newestDate: Date | null;
}

export interface TimeRange {
  startTime: number;
  endTime?: number;
}

export type ClearType = 'hour' | 'day' | 'all';

export interface ClearOption {
  type: ClearType;
  label: string;
  description: string;
  timeRange?: number; // milliseconds from now
}

export interface DataClearSelectionDialogProps {
  visible: boolean;
  dataStats: DataStats;
  onClear: (type: ClearType) => void;
  onCancel: () => void;
  isClearing: boolean;
}
