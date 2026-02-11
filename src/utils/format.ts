const pad2 = (value: number) => String(value).padStart(2, "0");

export const formatDateYYMMDD = (date: Date) => {
  const year = String(date.getFullYear()).slice(-2);
  return `${year}.${pad2(date.getMonth() + 1)}.${pad2(date.getDate())}`;
};

export const formatDuration = (rawVal: string | number | null) => {
  try {
    if (!rawVal) return "00:00";
    const rawStr = String(rawVal).trim();

    let totalSeconds = 0;
    if (rawStr.includes(":")) {
      const parts = rawStr.split(":").map((part) => Number(part));
      if (parts.some((part) => Number.isNaN(part))) return "00:00";

      if (parts.length === 3) {
        totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 2) {
        totalSeconds = parts[0] * 60 + parts[1];
      } else {
        return "00:00";
      }
    } else {
      totalSeconds = Number(rawStr);
    }

    if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "00:00";

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    if (hours > 0) {
      return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
    }
    return `${pad2(minutes)}:${pad2(seconds)}`;
  } catch {
    return "00:00";
  }
};
