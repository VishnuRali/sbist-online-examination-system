const formatDateTime = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

const formatDate = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

const formatTime = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

const formatEmailDate = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const parseToIST = (dateStr) => {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;
  
  if (typeof dateStr === 'string') {
    const trimmed = dateStr.trim();
    if (/T\d{2}:\d{2}(:\d{2})?$/i.test(trimmed)) {
      return new Date(trimmed + '+05:30');
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return new Date(trimmed + 'T00:00:00+05:30');
    }
  }
  return new Date(dateStr);
};

module.exports = {
  formatDateTime,
  formatDate,
  formatTime,
  formatEmailDate,
  parseToIST
};
