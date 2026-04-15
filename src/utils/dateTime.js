const { normalizeText } = require("./text");

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDateToDisplay(date) {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addDays(date, days) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function buildValidDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  const isSameDate =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  return isSameDate ? date : null;
}

function extractExplicitDate(rawValue = "") {
  const value = String(rawValue)
    .trim()
    .replace(/\s*([/-])\s*/g, "$1")
    .replace(/\s+/g, " ");
  const isoMatch = value.match(/(?:^|[^\d])(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/);
  const dayFirstMatch = value.match(/(?:^|[^\d])(\d{1,2})(?:[/-]|\s)(\d{1,2})(?:[/-]|\s)(\d{4})(?!\d)/);
  let day;
  let month;
  let year;

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (dayFirstMatch) {
    day = Number(dayFirstMatch[1]);
    month = Number(dayFirstMatch[2]);
    year = Number(dayFirstMatch[3]);
  } else {
    return null;
  }

  return buildValidDate(year, month, day);
}

function resolveWeekdayReference(rawValue = "") {
  const normalizedValue = normalizeText(String(rawValue).trim())
    .replace(/[,.;!?]+/g, " ")
    .replace(/\s+/g, " ");
  const weekdayMatch = normalizedValue.match(/\b(?:este|el)\s+(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/);

  if (!weekdayMatch) {
    return null;
  }

  const weekdays = {
    domingo: 0,
    lunes: 1,
    martes: 2,
    miercoles: 3,
    jueves: 4,
    viernes: 5,
    sabado: 6
  };
  const today = startOfDay(new Date());
  const targetDay = weekdays[weekdayMatch[1]];

  if (targetDay === undefined) {
    return null;
  }

  const difference = (targetDay - today.getDay() + 7) % 7;
  return addDays(today, difference);
}

function extractRelativeDate(rawValue = "") {
  const normalizedValue = normalizeText(String(rawValue).trim())
    .replace(/[,.;!?]+/g, " ")
    .replace(/\s+/g, " ");

  if (!normalizedValue) {
    return null;
  }

  const today = startOfDay(new Date());

  if (/\bpasado manana\b/.test(normalizedValue)) {
    return addDays(today, 2);
  }

  if (/\bmanana\b/.test(normalizedValue)) {
    return addDays(today, 1);
  }

  return resolveWeekdayReference(normalizedValue);
}

function parseDateInput(rawValue = "") {
  const date = extractExplicitDate(rawValue) || extractRelativeDate(rawValue);

  if (!date) {
    return { valid: false };
  }

  return {
    valid: true,
    date,
    formatted: formatDateToDisplay(date)
  };
}

function isPastDate(date) {
  const today = startOfDay(new Date());
  const candidate = startOfDay(date);
  return candidate < today;
}

function extractTimeParts(rawValue = "") {
  const value = normalizeText(String(rawValue).trim())
    .replace(/(\d)\.(\d)/g, "$1:$2")
    .replace(/\s+/g, " ");

  if (!value) {
    return null;
  }

  const exactMatch = value.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);

  if (exactMatch) {
    return exactMatch;
  }

  const contextualPatterns = [
    /\bcomo\s+a\s+las\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/,
    /\ba\s+las\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/,
    /\btipo\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/
  ];

  for (const pattern of contextualPatterns) {
    const match = value.match(pattern);

    if (match) {
      return match;
    }
  }

  return value.match(/(?:^|[^\d])(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
}

function buildParsedTimeResult(hours, minuteValue, extra = {}) {
  return {
    valid: true,
    formatted: `${pad(hours)}:${pad(minuteValue)}`,
    minutes: hours * 60 + minuteValue,
    hourValue: hours,
    minuteValue,
    ...extra
  };
}

function parseTimeInput(rawValue = "") {
  const match = extractTimeParts(rawValue);

  if (!match) {
    return { valid: false };
  }

  const sourceHours = Number(match[1]);
  let hours = sourceHours;
  const minuteValue = Number(match[2] || "00");
  const meridiem = match[3] ? match[3].toLowerCase() : null;

  if (minuteValue > 59) {
    return { valid: false };
  }

  if (meridiem) {
    if (hours < 1 || hours > 12) {
      return { valid: false };
    }

    if (meridiem === "pm" && hours !== 12) {
      hours += 12;
    }

    if (meridiem === "am" && hours === 12) {
      hours = 0;
    }
  } else if (hours > 23) {
    return { valid: false };
  }

  return buildParsedTimeResult(hours, minuteValue, {
    sourceHours,
    sourceMinutes: minuteValue,
    meridiem,
    hasExplicitMeridiem: Boolean(meridiem),
    isAmbiguous: !meridiem && sourceHours >= 1 && sourceHours <= 12
  });
}

function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function isTimeWithinRange(time, minimumTime, maximumTime) {
  const candidateMinutes = timeToMinutes(time);
  return candidateMinutes >= timeToMinutes(minimumTime) && candidateMinutes <= timeToMinutes(maximumTime);
}

function isTimeAfterCutoff(time, cutoffTime) {
  return timeToMinutes(time) > timeToMinutes(cutoffTime);
}

function buildAlternativeTimeCandidate(parsedTime) {
  if (!parsedTime.valid || parsedTime.hasExplicitMeridiem || !parsedTime.isAmbiguous) {
    return null;
  }

  const alternativeHours = parsedTime.sourceHours === 12 ? 0 : parsedTime.sourceHours + 12;

  if (alternativeHours === parsedTime.hourValue) {
    return null;
  }

  return buildParsedTimeResult(alternativeHours, parsedTime.minuteValue, {
    sourceHours: parsedTime.sourceHours,
    sourceMinutes: parsedTime.sourceMinutes,
    meridiem: null,
    hasExplicitMeridiem: false,
    isAmbiguous: true,
    inferredFromAmbiguousInput: true
  });
}

function parseTimeInputWithRange(rawValue = "", minimumTime, maximumTime) {
  const parsedTime = parseTimeInput(rawValue);

  if (!parsedTime.valid) {
    return { valid: false, reason: "invalid_format" };
  }

  if (isTimeWithinRange(parsedTime.formatted, minimumTime, maximumTime)) {
    return {
      ...parsedTime,
      rangeValid: true
    };
  }

  const alternativeTime = buildAlternativeTimeCandidate(parsedTime);

  if (alternativeTime && isTimeWithinRange(alternativeTime.formatted, minimumTime, maximumTime)) {
    return {
      ...alternativeTime,
      rangeValid: true
    };
  }

  return {
    ...parsedTime,
    valid: false,
    rangeValid: false,
    reason: "out_of_range"
  };
}

module.exports = {
  parseDateInput,
  parseTimeInput,
  parseTimeInputWithRange,
  isPastDate,
  isTimeWithinRange,
  isTimeAfterCutoff,
  formatDateToDisplay
};
