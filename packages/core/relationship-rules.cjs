const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };
const normalizeGoal = value => String(value || '').trim().slice(0, 500);
function normalizeMode(value) {
  const mode = value == null ? 'free' : String(value).trim();
  if (mode === 'free' || mode === 'story') return mode;
  fail('聊天模式必须是 free 或 story');
}
function patchStoryGoal(relationship, input = {}, now = new Date().toISOString()) {
  if (relationship.mode !== 'story') fail('自由模式没有故事目标', 409);
  const provided = Object.hasOwn(input, 'goal');
  const goal = provided ? normalizeGoal(input.goal) : relationship.goal;
  if (!goal) fail('故事目标不能为空');
  const changed = provided && goal !== relationship.goal;
  let goalStatus = changed ? 'active' : relationship.goalStatus;
  let goalAchievedAt = changed ? null : relationship.goalAchievedAt;
  let goalResolution = changed ? '' : relationship.goalResolution;
  if (Object.hasOwn(input, 'goalStatus')) {
    goalStatus = input.goalStatus;
    if (!['active', 'achieved'].includes(goalStatus)) fail('目标状态必须是 active 或 achieved');
    if (goalStatus === 'achieved') {
      goalAchievedAt = goalAchievedAt || now;
      goalResolution = String(input.goalResolution || '').trim().slice(0, 500);
      if (!goalResolution) fail('确认目标达成时需要提供判断依据');
    } else { goalAchievedAt = null; goalResolution = ''; }
  }
  return { goal, goalStatus, goalAchievedAt, goalResolution };
}
module.exports = { normalizeGoal, normalizeMode, patchStoryGoal };
