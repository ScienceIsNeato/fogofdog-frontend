// Mock expo-task-manager
export const defineTask = jest.fn();
export const isTaskRegisteredAsync = jest.fn().mockResolvedValue(false);
export const startTaskAsync = jest.fn().mockResolvedValue(undefined);
export const stopTaskAsync = jest.fn().mockResolvedValue(undefined);
export const unregisterTaskAsync = jest.fn().mockResolvedValue(undefined);
export const getRegisteredTasksAsync = jest.fn().mockResolvedValue([]);

export default {
  defineTask,
  isTaskRegisteredAsync,
  startTaskAsync,
  stopTaskAsync,
  unregisterTaskAsync,
  getRegisteredTasksAsync,
};
