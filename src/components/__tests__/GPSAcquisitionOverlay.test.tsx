import React from 'react';
import { render } from '@testing-library/react-native';
import { GPSAcquisitionOverlay } from '../GPSAcquisitionOverlay';

describe('GPSAcquisitionOverlay', () => {
  it('renders overlay with testID and text when visible', () => {
    const { getByTestId, getByText } = render(<GPSAcquisitionOverlay visible={true} />);

    expect(getByTestId('gps-acquisition-overlay')).toBeTruthy();
    expect(getByText('Acquiring GPS signal…')).toBeTruthy();
  });

  it('returns null when not visible', () => {
    const { queryByTestId } = render(<GPSAcquisitionOverlay visible={false} />);

    expect(queryByTestId('gps-acquisition-overlay')).toBeNull();
  });

  it('uses pointerEvents="none" so the map remains interactive', () => {
    const { getByTestId } = render(<GPSAcquisitionOverlay visible={true} />);

    const overlay = getByTestId('gps-acquisition-overlay');
    expect(overlay.props.pointerEvents).toBe('none');
  });
});
