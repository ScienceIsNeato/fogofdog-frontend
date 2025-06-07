export const TaskManager = {
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn().mockResolvedValue(false),
};

export default TaskManager;
