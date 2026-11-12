export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const time = (value: string) => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
export const dateLabel = (value: string) => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value.length === 10 ? `${value}T12:00:00+08:00` : value));
export const duration = (start: string, end: string) => start && end ? ((+new Date(end) - +new Date(start)) / 3600000).toFixed(1) : '—';
