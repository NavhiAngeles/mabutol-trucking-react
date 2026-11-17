export function snapshotStatus(label, lastUpdated, error) {
  if (lastUpdated == null) return `${label}: no successful refresh yet.`;
  const time = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'medium',
  }).format(new Date(lastUpdated));
  return `${label}: last successful refresh ${time} PHT.${error ? ' Refresh failed — showing retained snapshot.' : ' Showing latest successfully loaded data.'}`;
}
