import type {
  DataStats,
  TimeRange,
  ClearType,
  ClearOption,
  DataClearSelectionDialogProps,
} from '../dataClear';

describe('dataClear types', () => {
  it('should define DataStats interface correctly', () => {
    const dataStats: DataStats = {
      totalPoints: 100,
      recentPoints: 25,
      oldestDate: new Date('2024-01-01'),
      newestDate: new Date('2024-01-02'),
    };

    expect(dataStats.totalPoints).toBe(100);
    expect(dataStats.recentPoints).toBe(25);
    expect(dataStats.oldestDate).toBeInstanceOf(Date);
    expect(dataStats.newestDate).toBeInstanceOf(Date);
  });

  it('should define TimeRange interface correctly', () => {
    const timeRange: TimeRange = {
      startTime: Date.now(),
      endTime: Date.now() + 3600000, // +1 hour
    };

    expect(typeof timeRange.startTime).toBe('number');
    expect(typeof timeRange.endTime).toBe('number');
  });

  it('should define ClearType correctly', () => {
    const types: ClearType[] = ['hour', 'day', 'all'];

    expect(types).toContain('hour');
    expect(types).toContain('day');
    expect(types).toContain('all');
  });

  it('should define ClearOption interface correctly', () => {
    const clearOption: ClearOption = {
      type: 'hour',
      label: 'Last Hour',
      description: 'Clear data from the last hour',
      timeRange: 3600000,
    };

    expect(clearOption.type).toBe('hour');
    expect(typeof clearOption.label).toBe('string');
    expect(typeof clearOption.description).toBe('string');
    expect(typeof clearOption.timeRange).toBe('number');
  });

  it('should define DataClearSelectionDialogProps interface correctly', () => {
    const props: DataClearSelectionDialogProps = {
      visible: true,
      dataStats: {
        totalPoints: 50,
        recentPoints: 10,
        oldestDate: new Date(),
        newestDate: new Date(),
      },
      onClear: jest.fn(),
      onCancel: jest.fn(),
      isClearing: false,
    };

    expect(props.visible).toBe(true);
    expect(props.dataStats.totalPoints).toBe(50);
    expect(typeof props.onClear).toBe('function');
    expect(typeof props.onCancel).toBe('function');
    expect(props.isClearing).toBe(false);
  });
});
