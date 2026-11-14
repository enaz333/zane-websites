export const habits = ['Read for 20 minutes', 'Take a walk', 'Practice a skill'];
export function completion(values) {
  return Math.round(habits.filter(name => values.includes(name)).length / habits.length * 100);
}
export function toggle(values, name) {
  return values.includes(name) ? values.filter(value => value !== name) : [...values, name];
}
