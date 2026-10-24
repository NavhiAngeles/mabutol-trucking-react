import { supabase } from './supabaseClient';
export function reportScheduleService(client = supabase) {
  async function identity() {
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) throw new Error('Please sign in again.');
    return data.user.id;
  }
  async function load(type, page = 0) {
    const owner = await identity();
    const [schedules, reports] = await Promise.all([
      client.from('report_schedules').select('id,report_type,frequency,local_time,enabled,next_run_at').eq('owner_id', owner).eq('report_type', type).order('created_at', { ascending: false }),
      client.from('report_snapshots').select('id,report_type,period_start,period_end,generated_at,status,error_message').eq('owner_id', owner).eq('report_type', type).order('generated_at', { ascending: false }).order('id').range(page * 10, page * 10 + 9),
    ]);
    if (schedules.error || reports.error || !Array.isArray(schedules.data) || !Array.isArray(reports.data)) throw new Error('Unable to load saved report schedules. Please retry.');
    return { schedules: schedules.data, reports: reports.data };
  }
  async function create(type, frequency, time) {
    await identity();
    if (!['Overview', 'Shipments', 'Drivers', 'Revenue'].includes(type) || !['daily', 'weekly', 'monthly'].includes(frequency) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Choose a valid report frequency and time.');
    const { data, error } = await client.from('report_schedules').insert({ report_type: type, frequency, local_time: time }).select('id').single();
    if (error || !data?.id) throw new Error(error?.message || 'Schedule was not saved. Refresh before retrying.');
  }
  async function toggle(schedule) {
    const owner = await identity();
    const { data, error } = await client.from('report_schedules').update({ enabled: !schedule.enabled }).eq('id', schedule.id).eq('owner_id', owner).eq('enabled', schedule.enabled).select('id').single();
    if (error || !data?.id) throw new Error('Schedule changed elsewhere or could not be saved. Refresh and retry.');
  }
  async function read(id) {
    const owner = await identity();
    const { data, error } = await client.from('report_snapshots').select('report_type,period_start,period_end,generated_at,model_version,status,data').eq('id', id).eq('owner_id', owner).single();
    if (error || !data) throw new Error('Saved report could not be downloaded. Please retry.');
    return data;
  }
  return { load, create, toggle, read };
}
export const reportSchedules = reportScheduleService();
