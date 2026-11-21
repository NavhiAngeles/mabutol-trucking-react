// TextBee serves Philippine mobile numbers. Use one canonical representation
// for the Auth identity, administrative enrollment and recovery comparisons.
export function normalizeOfficePhone(raw) {
  const value = String(raw ?? '').trim().replace(/[\s()\-–—.]/g, '');
  let phone = value;
  if (/^09\d{9}$/.test(value)) {
    phone = `+63${value.slice(1)}`;
  } else if (/^9\d{9}$/.test(value)) {
    phone = `+63${value}`;
  } else if (/^639\d{9}$/.test(value)) {
    phone = `+${value}`;
  } else if (/^\+?6309\d{9}$/.test(value)) {
    phone = `+63${value.replace(/^\+?630/, '')}`;
  } else if (/^00630?9\d{9}$/.test(value)) {
    phone = `+63${value.replace(/^00630?/, '')}`;
  }
  if (!/^\+639\d{9}$/.test(phone)) throw new Error('Enter a Philippine mobile number, such as 09XXXXXXXXX or +639XXXXXXXXX.');
  return phone;
}
