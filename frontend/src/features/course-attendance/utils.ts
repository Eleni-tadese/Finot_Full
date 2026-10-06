export const percentageColor = (percentage: number) =>
  percentage >= 80 ? "bg-green-600" : percentage >= 60 ? "bg-yellow-600" : "bg-red-600";
