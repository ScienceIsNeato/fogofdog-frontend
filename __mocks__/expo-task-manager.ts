module.exports = {
  defineTask: jest.fn(),
  unregisterAllTasksAsync: jest.fn().mockResolvedValue(undefined),
  isTaskDefinedAsync: jest.fn().mockResolvedValue(false),
};