/**
 * Physical weighted progress calculation for lighting pole manufacturing.
 * Formula: sum(weight_i * progress_i) / sum(weight_i)
 */
export function calcWeightedProgress(stages) {
  if (!stages || !stages.length) return 0;
  const totalWeight = stages.reduce((sum, s) => sum + Number(s.weight ?? 0.14), 0);
  if (totalWeight <= 0) return 0;
  const weightedSum = stages.reduce((sum, s) => sum + (Number(s.weight ?? 0.14) * Number(s.progress || 0)), 0);
  return Math.min(100, Math.max(0, Math.round(weightedSum / totalWeight)));
}
