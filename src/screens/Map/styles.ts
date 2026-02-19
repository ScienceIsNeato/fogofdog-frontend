import { StyleSheet } from 'react-native';

// Common modal container styles to avoid duplication
const modalContainerBase = {
  backgroundColor: '#fff',
  padding: 24,
  borderRadius: 12,
  margin: 20,
  alignItems: 'center' as const,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.25,
  shadowRadius: 4,
  elevation: 5,
};

export const styles = StyleSheet.create({
  // Map screen root container
  container: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  trackingControlButton: {
    position: 'absolute',
    bottom: 180, // Positioned for equal spacing with HUD separator
    alignSelf: 'center',
  },

  // Loading container styles
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0', // Light background for loading
  },
  loadingText: {
    fontSize: 18,
    color: '#333',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#1976d2',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Shared modal container styles
  modalContainer: modalContainerBase,

  // Critical error styles (uses shared base)
  criticalErrorContainer: modalContainerBase,
  criticalErrorTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#d32f2f',
    textAlign: 'center',
    marginBottom: 16,
  },
  criticalErrorMessage: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 22,
  },
  criticalErrorDetails: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    fontStyle: 'italic',
  },
  criticalErrorButtons: {
    flexDirection: 'column',
    width: '100%',
    gap: 12,
  },
  criticalErrorButtonPrimary: {
    backgroundColor: '#1976d2',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  criticalErrorButtonPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  criticalErrorButtonSecondary: {
    backgroundColor: '#f5f5f5',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  criticalErrorButtonSecondaryText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },

  // Warning overlay styles
  warningContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  // Warning box uses shared modal container styles
  warningBox: modalContainerBase,
  warningTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ff9800',
    textAlign: 'center',
    marginBottom: 16,
  },
  warningText: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 22,
  },
  warningButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
    marginTop: 8,
  },
  warningButtonPrimary: {
    flex: 1,
    backgroundColor: '#1976d2',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  warningButtonPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  warningButtonSecondary: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  warningButtonSecondaryText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
});
