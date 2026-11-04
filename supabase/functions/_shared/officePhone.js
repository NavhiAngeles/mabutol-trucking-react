// TextBee serves Philippine mobile numbers. Use one canonical representation
// for the Auth identity, administrative enrollment and recovery comparisons.
export function normalizeOfficePhone(raw) {
  const value = String(raw ?? '').trim().replace(/[ ()-]/g, '');
  const phone = /^09\d{9}$/.test(value) ? `+63${value.slice(1)}`
    : /^9\d{9}$/.test(value) ? `+63${value}`
    : /^639\d{9}$/.test(value) ? `+${value}` : value;
  if (!/^\+639\d{9}$/.test(phone)) throw new Error('Enter a Philippine mobile number, such as 09XXXXXXXXX or +639XXXXXXXXX.');
  return phone;
}
