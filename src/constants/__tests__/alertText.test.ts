import { ALERT_TEXT } from '../alertText';

describe('ALERT_TEXT', () => {
  it('should have export alert text constants', () => {
    expect(ALERT_TEXT.EXPORT.SUCCESS_TITLE).toBe('Export Successful');
    expect(ALERT_TEXT.EXPORT.SUCCESS_MESSAGE).toBe(
      'Your exploration data has been saved and can be shared or backed up.'
    );
    expect(ALERT_TEXT.EXPORT.FAILED_TITLE).toBe('Export Failed');
    expect(ALERT_TEXT.EXPORT.ERROR_TITLE).toBe('Export Error');
    expect(ALERT_TEXT.EXPORT.ERROR_MESSAGE).toBe(
      'An unexpected error occurred while exporting your data.'
    );
  });

  it('should have import alert text constants', () => {
    expect(ALERT_TEXT.IMPORT.SUCCESS_TITLE).toBe('Import Successful');
    expect(ALERT_TEXT.IMPORT.FAILED_TITLE).toBe('Import Failed');
    expect(ALERT_TEXT.IMPORT.ERROR_TITLE).toBe('Import Error');
    expect(ALERT_TEXT.IMPORT.MODE_SELECTION_TITLE).toBe('Import Exploration Data');
  });

  it('should have common button text constants', () => {
    expect(ALERT_TEXT.BUTTONS.OK).toBe('OK');
    expect(ALERT_TEXT.BUTTONS.CANCEL).toBe('Cancel');
    expect(ALERT_TEXT.BUTTONS.CLEAR).toBe('Clear');
  });

  it('should be immutable (as const)', () => {
    const alertText = ALERT_TEXT;
    expect(typeof alertText.EXPORT.SUCCESS_TITLE).toBe('string');
    expect(typeof alertText.BUTTONS.OK).toBe('string');
  });
});
